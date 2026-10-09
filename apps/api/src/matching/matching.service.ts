import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  DEFAULT_MATCH_PARAMS,
  isVerifiedBadge,
  maskPhone,
  MATCH_NOTIFICATION_TYPES,
  matchLoadWithCapacity,
  MAX_MATCH_NOTIFICATIONS_PER_HOUR,
  trDay,
  VISIBLE_LOAD_STATUSES,
  type BodyType,
  type CapacityForMatch,
  type LoadForMatch,
  type LoadStatus,
  type MatchResult,
  type VehicleType,
} from "@nakliye/shared";
import { and, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AlertsService } from "../alerts/alerts.service.js";
import { DB, type Db } from "../db/db.module.js";
import { capacityPosts, companies, districts, favoriteCarriers, loadPosts, matches, provinces, users, vehicles } from "../db/schema.js";
import { NotificationsService, type NotifyLimit } from "../notifications/notifications.service.js";

const P = DEFAULT_MATCH_PARAMS;
/**
 * SQL ön süzgecinde yarıçapa eklenen pay. PostGIS (sferoid) ile shared haversine (küre) sınırda birkaç yüz metre
 * farklı ölçebilir; pay sayesinde SQL gerçek bir adayı kaçırmaz, kesin kararı shared matchLoadWithCapacity verir.
 */
const PREFILTER_MARGIN_KM = 2;
const MAX_CANDIDATES = 200;
const SWEEP_BATCH = 100;
/** BR-22: kullanıcı başına saatte en fazla 5 eşleşme bildirimi */
const LIMIT: NotifyLimit = { perHour: MAX_MATCH_NOTIFICATIONS_PER_HOUR, types: MATCH_NOTIFICATION_TYPES };

type LoadRow = typeof loadPosts.$inferSelect;
type CapRow = typeof capacityPosts.$inferSelect;
type VehicleRow = typeof vehicles.$inferSelect;
type Point = { x: number; y: number };
type Candidate = Extract<MatchResult, { candidate: true }>;

const od = alias(districts, "od");
const op = alias(provinces, "op");
const dd = alias(districts, "dd");
const dp = alias(provinces, "dp");

const geog = (pt: Point) => sql`ST_SetSRID(ST_MakePoint(${pt.x}::float8, ${pt.y}::float8), 4326)::geography`;
const latLng = (pt: Point) => ({ lat: pt.y, lng: pt.x });
const isCandidate = <T extends { m: MatchResult }>(c: T): c is T & { m: Candidate } => c.m.candidate;
/**
 * Tarih aralıkları ±tolerans ile kesişiyor mu (iki uç dahil; daterange varsayılanı '[)' son günü dışlardı).
 * Hepsi ::date'e çevrilir: değer sütun değil parametreyse Postgres "$1 - 1"i tamsayı sanıyor.
 */
const datesOverlap = (cFrom: unknown, cTo: unknown, lFrom: unknown, lTo: unknown) =>
  sql`daterange((${cFrom})::date - ${P.dateToleranceDays}::int, (${cTo})::date + ${P.dateToleranceDays}::int, '[]') && daterange((${lFrom})::date, (${lTo})::date, '[]')`;
const dayText = (d: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/**
 * Kural tabanlı eşleştirme (BR-20…22, FR-23). Yeni yük ↔ uygun boş araçlar, yeni boş araç ↔ uygun yükler.
 * Tetik: ilan kaydedilince arka planda hemen (NFR-01: < 60 sn) + zamanlayıcı her turda matched_at'i boş ilanları süpürür.
 * Bir çift (yük, araç ilanı) ilk kez bulunduğunda bildirilir; matches tekil indeksi çift bildirimi önler.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly notifications: NotificationsService,
    private readonly alerts: AlertsService,
  ) {}

  /** İsteği bekletmeden eşleştirmeyi başlatır; hata olursa zamanlayıcı süpürmesi yakalar (matched_at boş kalır). */
  schedule(kind: "load" | "capacity", id: string) {
    setImmediate(() => {
      (kind === "load" ? this.matchLoad(id) : this.matchCapacity(id)).catch((e: Error) =>
        this.logger.error(`Eşleştirme hatası (${kind} ${id}): ${e.message}`),
      );
    });
  }

  /** Zamanlayıcı: henüz eşleştirilmemiş yayındaki ilanlar. */
  async sweep(now = new Date()): Promise<number> {
    const today = trDay(now);
    const loads = await this.db
      .select({ id: loadPosts.id })
      .from(loadPosts)
      .where(and(eq(loadPosts.status, "teyitli"), isNull(loadPosts.matchedAt), gte(loadPosts.loadTo, today)))
      .limit(SWEEP_BATCH);
    for (const l of loads) await this.matchLoad(l.id, now);
    const caps = await this.db
      .select({ id: capacityPosts.id })
      .from(capacityPosts)
      .where(and(eq(capacityPosts.status, "aktif"), isNull(capacityPosts.matchedAt), gte(capacityPosts.availableTo, today)))
      .limit(SWEEP_BATCH);
    for (const c of caps) await this.matchCapacity(c.id, now);
    return loads.length + caps.length;
  }

  // ── Yeni yük → uygun boş araçlar ───────────────────────────────────

  async matchLoad(loadId: string, now = new Date()): Promise<number> {
    const [load] = await this.db.select().from(loadPosts).where(eq(loadPosts.id, loadId));
    if (!load) return 0;
    let fresh = 0;
    // Bildirim yalnız teyitli ilan için (F1: gördüğün yük şu an geçerli)
    if (load.status === "teyitli" && load.loadTo >= trDay(now)) {
      const route = await this.loadRoute(load.id);
      // P7: önce yük sahibinin favori nakliyecilerine (mesafe şartı yok, saatlik sınıra girmez). ref_key eşleşmeyle
      // ortak: aynı yük için nakliyeciye tek bildirim; ilan yeniden eşleştirilse de tekrar gitmez.
      const favorites = await this.db
        .select({ carrierId: favoriteCarriers.carrierId })
        .from(favoriteCarriers)
        .where(eq(favoriteCarriers.shipperId, load.shipperId));
      for (const f of favorites) {
        await this.notifications.notify(f.carrierId, {
          type: "favorite_load",
          refKey: `match:load:${load.id}`,
          title: "Çalıştığınız yük sahibinden yeni ilan",
          body: `${route}, ${dayText(load.loadFrom)} yükleme, ${load.weightTon} ton`,
          data: { type: "match", loadId: load.id },
        });
      }
      for (const c of await this.candidatesForLoad(load, now)) {
        if (!(await this.newPair(load.id, c.cap.id, c.m.score))) continue;
        fresh++;
        const sent = await this.notifications.notify(
          c.cap.carrierId,
          {
            type: "match_for_carrier",
            refKey: `match:load:${load.id}`, // nakliyeciye aynı yük için tek bildirim (iki boş araç ilanı da uysa)
            title: "Rotanıza uygun yeni yük",
            body: `${route}, ${dayText(load.loadFrom)} yükleme, ${load.weightTon} ton`,
            data: { type: "match", loadId: load.id, capacityId: c.cap.id },
          },
          LIMIT,
          now,
        );
        if (sent) await this.db.update(matches).set({ notifiedAt: now }).where(and(eq(matches.loadPostId, load.id), eq(matches.capacityPostId, c.cap.id)));
      }
      if (fresh > 0) await this.notifyShipper(load, route, fresh, now);
      // Rota alarmı (FR-22). ref_key eşleşmeyle ortak: boş araç ilanından zaten haber alan nakliyeciye ikinci bildirim
      // gitmez; ilan düzenlenip yeniden eşleştirilse de tekrar gitmez. Saatlik sınır (BR-22) eşleşmelerle ortak.
      for (const a of await this.alerts.ownersForLoad(load.id)) {
        await this.notifications.notify(
          a.userId,
          {
            type: "route_alert",
            refKey: `match:load:${load.id}`,
            title: "Alarmınıza uygun yeni yük",
            body: `${route}, ${dayText(load.loadFrom)} yükleme, ${load.weightTon} ton`,
            data: { type: "alert", loadId: load.id, alertId: a.alertId },
          },
          LIMIT,
          now,
        );
      }
    }
    await this.db.update(loadPosts).set({ matchedAt: now }).where(eq(loadPosts.id, load.id));
    return fresh;
  }

  // ── Yeni boş araç → uygun yükler ───────────────────────────────────

  async matchCapacity(capId: string, now = new Date()): Promise<number> {
    const [row] = await this.db
      .select({ cap: capacityPosts, vehicle: vehicles })
      .from(capacityPosts)
      .innerJoin(vehicles, eq(vehicles.id, capacityPosts.vehicleId))
      .where(eq(capacityPosts.id, capId));
    if (!row) return 0;
    const { cap, vehicle } = row;
    let fresh = 0;
    if (cap.status === "aktif" && cap.availableTo >= trDay(now) && vehicle.status === "aktif") {
      const found = await this.candidatesForCapacity(cap, vehicle, ["teyitli"], now);
      let best: (typeof found)[number] | undefined;
      for (const c of found) {
        if (!(await this.newPair(c.load.id, cap.id, c.m.score))) continue;
        fresh++;
        best ??= c; // aday listesi skora göre sıralı
        await this.notifyShipper(c.load, `${c.origin.province}/${c.origin.district} → ${c.dest.province}/${c.dest.district}`, 1, now);
      }
      if (best) {
        // Bu turda bulunan yeni yükler tek bildirimde (tekilleştirme gerekmez: yeni çiftler bu tura özeldir)
        const top = `${best.origin.province}/${best.origin.district} → ${best.dest.province}/${best.dest.district}`;
        const sent = await this.notifications.notify(
          cap.carrierId,
          {
            type: "match_for_carrier",
            title: "Boş aracınıza uygun yük bulundu",
            body: fresh === 1 ? `${top}, ${dayText(best.load.loadFrom)}` : `${fresh} yük; en uygunu ${top}`,
            data: { type: "match", capacityId: cap.id },
          },
          LIMIT,
          now,
        );
        if (sent) await this.db.update(matches).set({ notifiedAt: now }).where(and(eq(matches.capacityPostId, cap.id), isNull(matches.notifiedAt)));
      }
    }
    await this.db.update(capacityPosts).set({ matchedAt: now }).where(eq(capacityPosts.id, cap.id));
    return fresh;
  }

  // ── Listeleme (canlı hesap: düzenlenen ilanlar için de güncel) ─────

  /** Yük sahibi: ilanıma uygun boş araçlar */
  async forLoad(userId: string, loadId: string, now = new Date()) {
    const [load] = await this.db.select().from(loadPosts).where(and(eq(loadPosts.id, loadId), eq(loadPosts.shipperId, userId)));
    if (!load) throw new NotFoundException("İlan bulunamadı");
    if (!VISIBLE_LOAD_STATUSES.includes(load.status)) throw new ConflictException("İlan yayında değil; eşleşme aranmıyor");
    const items = (await this.candidatesForLoad(load, now)).map((c) => ({
      capacityId: c.cap.id,
      score: c.m.score,
      originKm: c.m.originKm,
      destKm: c.m.destKm,
      origin: c.origin,
      dest: c.cap.destDistrictId ? c.dest : null,
      availableFrom: c.cap.availableFrom,
      availableTo: c.cap.availableTo,
      vehicle: { vehicleType: c.vehicle.type, bodyType: c.vehicle.bodyType, capacityTon: c.vehicle.capacityTon, volumeM3: c.vehicle.volumeM3 },
      // Plaka ve tam numara gösterilmez (BR-40); iletişim teklif akışıyla
      carrier: { displayName: c.companyTitle ?? c.carrier.name, verified: isVerifiedBadge(c.carrier.level), phoneMasked: maskPhone(c.carrier.phone) },
    }));
    return { items };
  }

  /** Nakliyeci: boş aracıma uygun yükler (teyitli önce) */
  async forCapacity(userId: string, capId: string, now = new Date()) {
    const [row] = await this.db
      .select({ cap: capacityPosts, vehicle: vehicles })
      .from(capacityPosts)
      .innerJoin(vehicles, eq(vehicles.id, capacityPosts.vehicleId))
      .where(and(eq(capacityPosts.id, capId), eq(capacityPosts.carrierId, userId)));
    if (!row) throw new NotFoundException("İlan bulunamadı");
    if (row.cap.status !== "aktif") throw new ConflictException("İlan aktif değil; eşleşme aranmıyor");
    const found = await this.candidatesForCapacity(row.cap, row.vehicle, VISIBLE_LOAD_STATUSES, now);
    const rank = (s: LoadStatus) => (s === "teyitli" ? 0 : 1);
    const items = found
      .sort((a, b) => rank(a.load.status) - rank(b.load.status) || b.m.score - a.m.score)
      .map((c) => ({
        loadId: c.load.id,
        score: c.m.score,
        originKm: c.m.originKm,
        destKm: c.m.destKm,
        status: c.load.status,
        origin: c.origin,
        dest: c.dest,
        loadFrom: c.load.loadFrom,
        loadTo: c.load.loadTo,
        cargoType: c.load.cargoType,
        weightTon: c.load.weightTon,
        vehicleType: c.load.vehicleType,
        bodyType: c.load.bodyType,
        priceType: c.load.priceType,
        price: c.load.price,
        lastConfirmedAt: c.load.lastConfirmedAt,
        shipper: { displayName: c.companyTitle ?? c.shipper.name, verified: isVerifiedBadge(c.shipper.level), phoneMasked: maskPhone(c.shipper.phone) },
      }));
    return { items };
  }

  // ── Aday bulma (docs/04 §4) ────────────────────────────────────────

  private async candidatesForLoad(load: LoadRow, now: Date) {
    const rows = await this.db
      .select({
        cap: capacityPosts,
        vehicle: { type: vehicles.vehicleType, bodyType: vehicles.bodyType, capacityTon: vehicles.capacityTon, volumeM3: vehicles.volumeM3 },
        carrier: { name: users.name, trust: users.trustScore, level: users.verificationLevel, phone: users.phone },
        companyTitle: companies.title,
        origin: { districtId: od.id, district: od.name, provinceId: op.id, province: op.name },
        dest: { districtId: dd.id, district: dd.name, provinceId: dp.id, province: dp.name },
      })
      .from(capacityPosts)
      .innerJoin(vehicles, eq(vehicles.id, capacityPosts.vehicleId))
      .innerJoin(users, eq(users.id, capacityPosts.carrierId))
      .leftJoin(companies, eq(companies.ownerUserId, capacityPosts.carrierId))
      .innerJoin(od, eq(od.id, capacityPosts.originDistrictId))
      .innerJoin(op, eq(op.id, od.provinceId))
      .leftJoin(dd, eq(dd.id, capacityPosts.destDistrictId))
      .leftJoin(dp, eq(dp.id, dd.provinceId))
      .where(
        and(
          eq(capacityPosts.status, "aktif"),
          gte(capacityPosts.availableTo, trDay(now)),
          eq(vehicles.status, "aktif"),
          ne(capacityPosts.carrierId, load.shipperId), // kendi kendine eşleşme yok
          eq(vehicles.vehicleType, load.vehicleType),
          load.bodyType ? eq(vehicles.bodyType, load.bodyType) : undefined,
          gte(vehicles.capacityTon, load.weightTon),
          datesOverlap(capacityPosts.availableFrom, capacityPosts.availableTo, load.loadFrom, load.loadTo),
          sql`ST_DWithin(${capacityPosts.originGeom}::geography, ${geog(load.originGeom)}, ${(P.originRadiusKm + PREFILTER_MARGIN_KM) * 1000})`,
          sql`(${capacityPosts.destGeom} is null or ST_DWithin(${capacityPosts.destGeom}::geography, ${geog(load.destGeom)}, ${(P.destRadiusKm + PREFILTER_MARGIN_KM) * 1000}))`,
        ),
      )
      .limit(MAX_CANDIDATES);

    return rows
      .map((r) => ({
        ...r,
        m: matchLoadWithCapacity(
          this.loadForMatch(load),
          this.capForMatch(r.cap, r.vehicle),
          r.carrier.trust, // yük sahibine araçlar sıralanırken nakliyecinin güveni
          P,
        ),
      }))
      .filter(isCandidate)
      .sort((a, b) => b.m.score - a.m.score);
  }

  private async candidatesForCapacity(cap: CapRow, vehicle: VehicleRow, statuses: readonly LoadStatus[], now: Date) {
    const rows = await this.db
      .select({
        load: loadPosts,
        shipper: { name: users.name, trust: users.trustScore, level: users.verificationLevel, phone: users.phone },
        companyTitle: companies.title,
        origin: { districtId: od.id, district: od.name, provinceId: op.id, province: op.name },
        dest: { districtId: dd.id, district: dd.name, provinceId: dp.id, province: dp.name },
      })
      .from(loadPosts)
      .innerJoin(users, eq(users.id, loadPosts.shipperId))
      .leftJoin(companies, eq(companies.ownerUserId, loadPosts.shipperId))
      .innerJoin(od, eq(od.id, loadPosts.originDistrictId))
      .innerJoin(op, eq(op.id, od.provinceId))
      .innerJoin(dd, eq(dd.id, loadPosts.destDistrictId))
      .innerJoin(dp, eq(dp.id, dd.provinceId))
      .where(
        and(
          inArray(loadPosts.status, [...statuses]),
          gte(loadPosts.loadTo, trDay(now)),
          ne(loadPosts.shipperId, cap.carrierId),
          eq(loadPosts.vehicleType, vehicle.vehicleType),
          or(isNull(loadPosts.bodyType), eq(loadPosts.bodyType, vehicle.bodyType)),
          lte(loadPosts.weightTon, vehicle.capacityTon),
          datesOverlap(cap.availableFrom, cap.availableTo, loadPosts.loadFrom, loadPosts.loadTo),
          sql`ST_DWithin(${loadPosts.originGeom}::geography, ${geog(cap.originGeom)}, ${(P.originRadiusKm + PREFILTER_MARGIN_KM) * 1000})`,
          cap.destGeom
            ? sql`ST_DWithin(${loadPosts.destGeom}::geography, ${geog(cap.destGeom)}, ${(P.destRadiusKm + PREFILTER_MARGIN_KM) * 1000})`
            : undefined,
        ),
      )
      .limit(MAX_CANDIDATES);

    const capForMatch = this.capForMatch(cap, { type: vehicle.vehicleType, bodyType: vehicle.bodyType, capacityTon: vehicle.capacityTon });
    return rows
      .map((r) => ({ ...r, m: matchLoadWithCapacity(this.loadForMatch(r.load), capForMatch, r.shipper.trust, P) }))
      .filter(isCandidate)
      .sort((a, b) => b.m.score - a.m.score);
  }

  // ── Yardımcılar ────────────────────────────────────────────────────

  private capForMatch(cap: CapRow, v: { type: string; bodyType: string; capacityTon: number }): CapacityForMatch {
    return {
      origin: latLng(cap.originGeom),
      dest: cap.destGeom ? latLng(cap.destGeom) : null,
      availableFrom: cap.availableFrom,
      availableTo: cap.availableTo,
      vehicle: { type: v.type as VehicleType, bodyType: v.bodyType as BodyType, capacityTon: v.capacityTon },
    };
  }

  /** DB enum sütunları string olarak tiplenir (pgEnum anahtarlardan üretiliyor); shared'ın dar tiplerine çevrilir. */
  private loadForMatch(l: LoadRow): LoadForMatch {
    return {
      origin: latLng(l.originGeom),
      dest: latLng(l.destGeom),
      loadFrom: l.loadFrom,
      loadTo: l.loadTo,
      weightTon: l.weightTon,
      vehicleType: l.vehicleType as VehicleType,
      bodyType: l.bodyType as BodyType | null,
    };
  }

  /** Çift ilk kez mi bulundu? Tekil indeks: aynı anda iki eşleştirme çalışsa da yalnız biri "yeni" görür. */
  private async newPair(loadId: string, capId: string, score: number): Promise<boolean> {
    const [m] = await this.db
      .insert(matches)
      .values({ loadPostId: loadId, capacityPostId: capId, score })
      .onConflictDoNothing()
      .returning({ id: matches.id });
    return Boolean(m);
  }

  /** Yük sahibine ilanı için tek bildirim (BR-22): sonraki araçlar uygulamadaki listede görünür. */
  private notifyShipper(load: LoadRow, route: string, count: number, now: Date) {
    return this.notifications.notify(
      load.shipperId,
      {
        type: "match_for_shipper",
        refKey: `match:vehicles:${load.id}`,
        title: "İlanınıza uygun boş araç bulundu",
        body: `${route}: ${count === 1 ? "1 uygun araç" : `${count} uygun araç`}`,
        data: { type: "match", loadId: load.id },
      },
      LIMIT,
      now,
    );
  }

  private async loadRoute(loadId: string) {
    const [r] = await this.db
      .select({ o: op.name, od: od.name, d: dp.name, dd: dd.name })
      .from(loadPosts)
      .innerJoin(od, eq(od.id, loadPosts.originDistrictId))
      .innerJoin(op, eq(op.id, od.provinceId))
      .innerJoin(dd, eq(dd.id, loadPosts.destDistrictId))
      .innerJoin(dp, eq(dp.id, dd.provinceId))
      .where(eq(loadPosts.id, loadId));
    return r ? `${r.o}/${r.od} → ${r.d}/${r.dd}` : "Yük ilanı";
  }
}
