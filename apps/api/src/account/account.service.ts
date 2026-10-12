import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { DELETED_USER_NAME, OPEN_JOB_STATUSES, VISIBLE_LOAD_STATUSES } from "@nakliye/shared";
import { and, asc, count, eq, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuthService } from "../auth/auth.service.js";
import { DB, type Db, type Tx } from "../db/db.module.js";
import {
  callLogs,
  capacityPosts,
  companies,
  devices,
  districts,
  documents,
  favoriteCarriers,
  jobEvents,
  jobs,
  loadConfirmations,
  loadPosts,
  notifications,
  offers,
  otpCodes,
  provinces,
  ratings,
  refreshTokens,
  reports,
  routeAlerts,
  userRoles,
  users,
  vehicles,
} from "../db/schema.js";
import { OffersService } from "../jobs/offers.service.js";
import { LoadsService } from "../loads/loads.service.js";
import { CapacityService } from "../vehicles/capacity.service.js";

/** Kapanabilir ilanlar: yayındakiler ve moderasyonda bekleyenler */
const CLOSABLE_LOADS = [...VISIBLE_LOAD_STATUSES, "moderasyonda" as const];
/** Silme isteği yarıda kalırsa (çökme) zamanlayıcı bu kadar sonra tamamlar; süren isteğin adımlarıyla çakışmasın */
const PENDING_DELETION_GRACE_MS = 5 * 60_000;

const od = alias(districts, "od");
const op = alias(provinces, "op");
const dd = alias(districts, "dd");
const dp = alias(provinces, "dp");
const otherU = alias(users, "other_u");
const otherC = alias(companies, "other_c");

/**
 * Hesap ve kişisel veriler (FR-07, NFR-05, docs/04 §8): veri dökümü, hesap silme (anonimleştirme) ve askıya alma ile
 * ortak "açık işleri kapat" adımı.
 */
@Injectable()
export class AccountService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly auth: AuthService,
    private readonly loads: LoadsService,
    private readonly capacity: CapacityService,
    private readonly offers: OffersService,
  ) {}

  /**
   * Kullanıcının yayındaki/moderasyondaki ilanlarını ve aktif boş araç ilanlarını iptal eder, bekleyen tekliflerini geri
   * çeker; kapanan ilanlara gelmiş bekleyen teklifler sonuçlanmadı olur (nakliyecilere bildirim). Süren işlere dokunmaz.
   * Askıya alma ve hesap silme kullanır; tekrar çalıştırılabilir.
   */
  async closeOpenActivity(userId: string, now = new Date()) {
    // İlan kapatma mevcut akıştan geçer (açık teyit sorusu cevaplanır, durum makinesi denetlenir)
    const openLoads = await this.db.select({ id: loadPosts.id }).from(loadPosts).where(and(eq(loadPosts.shipperId, userId), inArray(loadPosts.status, CLOSABLE_LOADS)));
    for (const l of openLoads) await this.loads.close(userId, l.id, "iptal", now);
    const openCaps = await this.db.select({ id: capacityPosts.id }).from(capacityPosts).where(and(eq(capacityPosts.carrierId, userId), eq(capacityPosts.status, "aktif")));
    for (const c of openCaps) await this.capacity.close(userId, c.id, "iptal");
    const withdrawn = await this.db
      .update(offers)
      .set({ status: "geri_cekildi" })
      .where(and(eq(offers.carrierId, userId), eq(offers.status, "beklemede")))
      .returning({ id: offers.id });
    await this.offers.rejectStale();
    return { closedLoads: openLoads.length, closedCapacity: openCaps.length, withdrawnOffers: withdrawn.length };
  }

  // ── Hesap silme ────────────────────────────────────────────────────

  /** Silmeyi engelleyen durum: yönetici hesabı ya da sonuçlanmamış taşıma (karşı tarafın işi yarım kalmasın). */
  private async deletionBlocker(userId: string, db: Db | Tx = this.db): Promise<string | null> {
    const [admin] = await db.select({ n: count() }).from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, "admin")));
    if (admin && admin.n > 0) return "Yönetici hesabı silinemez.";
    const [open] = await db
      .select({ n: count() })
      .from(jobs)
      .where(and(or(eq(jobs.shipperId, userId), eq(jobs.carrierId, userId)), inArray(jobs.status, [...OPEN_JOB_STATUSES])));
    if (open && open.n > 0) return `Sonuçlanmamış ${open.n} taşımanız var. Hesabınızı silmeden önce tamamlanmalı ya da iptal edilmeli.`;
    return null;
  }

  private async phoneOf(userId: string): Promise<string> {
    const [u] = await this.db.select({ phone: users.phone, status: users.status }).from(users).where(eq(users.id, userId));
    if (!u?.phone || u.status === "silindi") throw new NotFoundException("Hesap bulunamadı");
    return u.phone;
  }

  /** Silme onay kodu hesabın kendi numarasına gider (giriş kodu gibi; tekrar istemek için 60 sn beklenir). */
  async requestDeletionCode(userId: string): Promise<void> {
    const blocker = await this.deletionBlocker(userId);
    if (blocker) throw new ConflictException(blocker);
    await this.auth.requestOtp(await this.phoneOf(userId), "silme");
  }

  /**
   * Hesabı siler (FR-07). Geri alınamaz; kodla yeniden doğrulanır. Kişisel alanlar anonimleştirilir, kayıt karşı
   * tarafların iş ve puan geçmişi için "Silinmiş kullanıcı" olarak kalır (docs/04 §8). Numara boşalır: aynı numarayla
   * yeniden girilirse yeni, boş bir hesap açılır.
   */
  async deleteAccount(userId: string, code: string, now = new Date()) {
    const phone = await this.phoneOf(userId);
    const blocker = await this.deletionBlocker(userId);
    if (blocker) throw new ConflictException(blocker);
    // Yanlış/süresi dolmuş onay kodu oturum hatası değildir: 401 dönseydi istemciler oturumu düşmüş sayıp girişe atardı
    await this.auth.consumeOtp(phone, code).catch((e: unknown) => {
      throw e instanceof UnauthorizedException ? new BadRequestException(e.message) : e;
    });

    await this.db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      // Bekleyen teklifler önce geri çekilir: aynı anda kabul edilen teklifte (kabul teklif satırını kilitler) ya kabul
      // önce biter ve iş aşağıdaki kontrolde görülür (silme 409, bu transaction geri alınır) ya da teklif artık beklemede değildir.
      await tx.update(offers).set({ status: "geri_cekildi" }).where(and(eq(offers.carrierId, userId), eq(offers.status, "beklemede")));
      const late = await this.deletionBlocker(userId, tx);
      if (late) throw new ConflictException(late);
      // Bu andan sonra giriş, belirteç yenileme ve erişim belirteci kapanır (AuthGuard durum kontrolü)
      await tx.update(users).set({ status: "silindi", deletedAt: now }).where(eq(users.id, userId));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
    });
    await this.finishDeletion(userId, now);
    return { deleted: true };
  }

  /** Silinmiş işaretli hesabın açık işlerini kapatır ve kişisel verilerini anonimleştirir (tekrar çalıştırılabilir). */
  private async finishDeletion(userId: string, now: Date) {
    await this.closeOpenActivity(userId, now);
    await this.db.transaction(async (tx) => {
      const [u] = await tx.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).for("update");
      if (!u) return;
      if (u.phone) await tx.delete(otpCodes).where(eq(otpCodes.phone, u.phone));
      await tx.update(users).set({ phone: null, name: DELETED_USER_NAME, suspendedAt: null, suspendReason: null }).where(eq(users.id, userId));
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      await tx.delete(companies).where(eq(companies.ownerUserId, userId));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
      await tx.delete(devices).where(eq(devices.userId, userId));
      await tx.delete(notifications).where(eq(notifications.userId, userId));
      await tx.delete(routeAlerts).where(eq(routeAlerts.userId, userId));
      await tx.delete(favoriteCarriers).where(or(eq(favoriteCarriers.shipperId, userId), eq(favoriteCarriers.carrierId, userId)));
      await tx.delete(documents).where(eq(documents.ownerUserId, userId));
      // Plaka kişiyi gösterebilir; araç kaydı karşı tarafın iş geçmişi için kalır
      await tx.update(vehicles).set({ status: "silindi", plate: "—" }).where(eq(vehicles.ownerUserId, userId));
      // Serbest metinler kişisel bilgi (ad, numara) içerebilir. Açık şikayetin notu yönetici kararı için kalır.
      await tx.update(loadPosts).set({ note: null }).where(eq(loadPosts.shipperId, userId));
      await tx.update(offers).set({ note: null }).where(eq(offers.carrierId, userId));
      await tx.update(ratings).set({ comment: null }).where(eq(ratings.raterId, userId));
      await tx.update(reports).set({ note: null }).where(and(eq(reports.reporterId, userId), ne(reports.status, "acik")));
    });
  }

  /** Zamanlayıcı: silme isteği yarıda kalan (çöken) hesapları tamamlar. */
  async finishPendingDeletions(now = new Date()): Promise<number> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.status, "silindi"), isNotNull(users.phone), lt(users.deletedAt, new Date(now.getTime() - PENDING_DELETION_GRACE_MS))));
    for (const r of rows) await this.finishDeletion(r.id, now);
    return rows.length;
  }

  // ── Veri dökümü ────────────────────────────────────────────────────

  /**
   * Kişisel verilerin JSON dökümü (FR-07, KVKK md. 11). Kullanıcının kendi girdiği ve hakkında tutulan veriler; özetler
   * (hash), belirteçler ve karşı tarafların numaraları yok. Henüz görünmeyen (kör) puanlar dahil edilmez.
   */
  async exportData(userId: string, now = new Date()) {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u || u.status === "silindi") throw new NotFoundException("Hesap bulunamadı");
    const db = this.db;
    const roles = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    const [company] = await db
      .select({ title: companies.title, taxNo: companies.taxNo, taxOffice: companies.taxOffice, address: companies.address, verifiedAt: companies.verifiedAt, createdAt: companies.createdAt })
      .from(companies)
      .where(eq(companies.ownerUserId, userId));

    const myLoads = await db
      .select({
        id: loadPosts.id,
        origin: { district: od.name, province: op.name },
        dest: { district: dd.name, province: dp.name },
        loadFrom: loadPosts.loadFrom,
        loadTo: loadPosts.loadTo,
        cargoType: loadPosts.cargoType,
        weightTon: loadPosts.weightTon,
        vehicleType: loadPosts.vehicleType,
        bodyType: loadPosts.bodyType,
        priceType: loadPosts.priceType,
        price: loadPosts.price,
        note: loadPosts.note,
        status: loadPosts.status,
        lastConfirmedAt: loadPosts.lastConfirmedAt,
        createdAt: loadPosts.createdAt,
      })
      .from(loadPosts)
      .innerJoin(od, eq(od.id, loadPosts.originDistrictId))
      .innerJoin(op, eq(op.id, od.provinceId))
      .innerJoin(dd, eq(dd.id, loadPosts.destDistrictId))
      .innerJoin(dp, eq(dp.id, dd.provinceId))
      .where(eq(loadPosts.shipperId, userId))
      .orderBy(asc(loadPosts.createdAt));
    const confirmations = myLoads.length
      ? await db
          .select({
            loadId: loadConfirmations.loadPostId,
            askedAt: loadConfirmations.askedAt,
            smsSentAt: loadConfirmations.smsSentAt,
            answeredAt: loadConfirmations.answeredAt,
            answer: loadConfirmations.answer,
            channel: loadConfirmations.channel,
          })
          .from(loadConfirmations)
          .where(inArray(loadConfirmations.loadPostId, myLoads.map((l) => l.id)))
          .orderBy(asc(loadConfirmations.askedAt))
      : [];

    const capacity = await db
      .select({
        id: capacityPosts.id,
        vehicleId: capacityPosts.vehicleId,
        origin: { district: od.name, province: op.name },
        dest: { district: dd.name, province: dp.name },
        availableFrom: capacityPosts.availableFrom,
        availableTo: capacityPosts.availableTo,
        status: capacityPosts.status,
        createdAt: capacityPosts.createdAt,
      })
      .from(capacityPosts)
      .innerJoin(od, eq(od.id, capacityPosts.originDistrictId))
      .innerJoin(op, eq(op.id, od.provinceId))
      .leftJoin(dd, eq(dd.id, capacityPosts.destDistrictId))
      .leftJoin(dp, eq(dp.id, dd.provinceId))
      .where(eq(capacityPosts.carrierId, userId))
      .orderBy(asc(capacityPosts.createdAt));

    const alerts = await db
      .select({
        origin: { district: od.name, province: op.name },
        originRadiusKm: routeAlerts.originRadiusKm,
        dest: { district: dd.name, province: dp.name },
        destRadiusKm: routeAlerts.destRadiusKm,
        vehicleType: routeAlerts.vehicleType,
        active: routeAlerts.active,
        createdAt: routeAlerts.createdAt,
      })
      .from(routeAlerts)
      .innerJoin(od, eq(od.id, routeAlerts.originDistrictId))
      .innerJoin(op, eq(op.id, od.provinceId))
      .leftJoin(dd, eq(dd.id, routeAlerts.destDistrictId))
      .leftJoin(dp, eq(dp.id, dd.provinceId))
      .where(eq(routeAlerts.userId, userId))
      .orderBy(asc(routeAlerts.createdAt));

    const displayName = sql<string | null>`coalesce(${otherC.title}, ${otherU.name})`;
    const offersMade = await db
      .select({ id: offers.id, loadId: offers.loadPostId, vehicleId: offers.vehicleId, price: offers.price, note: offers.note, status: offers.status, createdAt: offers.createdAt })
      .from(offers)
      .where(eq(offers.carrierId, userId))
      .orderBy(asc(offers.createdAt));
    const offersReceived = await db
      .select({ id: offers.id, loadId: offers.loadPostId, carrier: displayName, price: offers.price, note: offers.note, status: offers.status, createdAt: offers.createdAt })
      .from(offers)
      .innerJoin(loadPosts, eq(loadPosts.id, offers.loadPostId))
      .innerJoin(otherU, eq(otherU.id, offers.carrierId))
      .leftJoin(otherC, eq(otherC.ownerUserId, offers.carrierId))
      .where(eq(loadPosts.shipperId, userId))
      .orderBy(asc(offers.createdAt));

    const myJobs = await db
      .select({
        id: jobs.id,
        loadId: jobs.loadPostId,
        shipperId: jobs.shipperId,
        counterpart: displayName,
        vehicleId: jobs.vehicleId,
        agreedPrice: jobs.agreedPrice,
        status: jobs.status,
        createdAt: jobs.createdAt,
        deliveredAt: jobs.deliveredAt,
        completedAt: jobs.completedAt,
        cancelReason: jobs.cancelReason,
      })
      .from(jobs)
      .innerJoin(otherU, eq(otherU.id, sql`case when ${jobs.shipperId} = ${userId} then ${jobs.carrierId} else ${jobs.shipperId} end`))
      .leftJoin(otherC, eq(otherC.ownerUserId, otherU.id))
      .where(or(eq(jobs.shipperId, userId), eq(jobs.carrierId, userId)))
      .orderBy(asc(jobs.createdAt));
    const events = myJobs.length
      ? await db
          .select({ jobId: jobEvents.jobId, type: jobEvents.type, actorId: jobEvents.actorId, meta: jobEvents.meta, at: jobEvents.createdAt })
          .from(jobEvents)
          .where(inArray(jobEvents.jobId, myJobs.map((j) => j.id)))
          .orderBy(asc(jobEvents.createdAt))
      : [];

    const ratingsGiven = await db
      .select({ jobId: ratings.jobId, stars: ratings.stars, tags: ratings.tags, comment: ratings.comment, createdAt: ratings.createdAt, revealedAt: ratings.revealedAt })
      .from(ratings)
      .where(eq(ratings.raterId, userId))
      .orderBy(asc(ratings.createdAt));
    // Kör puanlama: görünür olmayan puan sahibine de gösterilmez (misillemeye karşı), dökümde de yok
    const ratingsReceived = await db
      .select({ jobId: ratings.jobId, stars: ratings.stars, tags: ratings.tags, comment: ratings.comment, revealedAt: ratings.revealedAt })
      .from(ratings)
      .where(and(eq(ratings.rateeId, userId), isNotNull(ratings.revealedAt)))
      .orderBy(asc(ratings.revealedAt));

    const reportsFiled = await db
      .select({
        targetType: reports.targetType,
        targetId: reports.targetId,
        reason: reports.reason,
        note: reports.note,
        status: reports.status,
        createdAt: reports.createdAt,
        resolvedAt: reports.resolvedAt,
      })
      .from(reports)
      .where(eq(reports.reporterId, userId))
      .orderBy(asc(reports.createdAt));

    const favorites = await db
      .select({ carrier: displayName, createdAt: favoriteCarriers.createdAt })
      .from(favoriteCarriers)
      .innerJoin(otherU, eq(otherU.id, favoriteCarriers.carrierId))
      .leftJoin(otherC, eq(otherC.ownerUserId, favoriteCarriers.carrierId))
      .where(eq(favoriteCarriers.shipperId, userId));

    return {
      format: "nakliye-kisisel-veri/1",
      generatedAt: now.toISOString(),
      note: "Hesabınıza ait kişisel veriler (KVKK md. 11). Karşı tarafların telefon numaraları, giriş kodları ve şifreli özetler dahil değildir. Henüz görünür olmayan (kör) puanlar dahil edilmez.",
      account: {
        id: u.id,
        phone: u.phone,
        name: u.name,
        roles: roles.map((r) => r.role),
        status: u.status,
        verificationLevel: u.verificationLevel,
        trustScore: u.trustScore,
        createdAt: u.createdAt,
      },
      company: company ?? null,
      sessions: await db
        .select({ createdAt: refreshTokens.createdAt, expiresAt: refreshTokens.expiresAt, revokedAt: refreshTokens.revokedAt })
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, userId))
        .orderBy(asc(refreshTokens.createdAt)),
      devices: await db.select({ platform: devices.platform, lastSeen: devices.lastSeen }).from(devices).where(eq(devices.userId, userId)),
      vehicles: await db
        .select({
          id: vehicles.id,
          plate: vehicles.plate,
          vehicleType: vehicles.vehicleType,
          bodyType: vehicles.bodyType,
          capacityTon: vehicles.capacityTon,
          volumeM3: vehicles.volumeM3,
          status: vehicles.status,
          createdAt: vehicles.createdAt,
        })
        .from(vehicles)
        .where(eq(vehicles.ownerUserId, userId))
        .orderBy(asc(vehicles.createdAt)),
      documents: await db
        .select({ id: documents.id, type: documents.type, vehicleId: documents.vehicleId, status: documents.status, rejectReason: documents.rejectReason, expiresAt: documents.expiresAt, createdAt: documents.createdAt })
        .from(documents)
        .where(eq(documents.ownerUserId, userId))
        .orderBy(asc(documents.createdAt)),
      loads: myLoads.map((l) => ({ ...l, confirmations: confirmations.filter((c) => c.loadId === l.id).map(({ loadId: _l, ...c }) => c) })),
      capacityPosts: capacity.map((c) => ({ ...c, dest: c.dest?.district ? c.dest : null })),
      routeAlerts: alerts.map((a) => ({ ...a, dest: a.dest?.district ? a.dest : null })),
      offersMade,
      offersReceived,
      jobs: myJobs.map(({ shipperId, ...j }) => ({
        ...j,
        role: shipperId === userId ? ("shipper" as const) : ("carrier" as const),
        events: events
          .filter((e) => e.jobId === j.id)
          .map((e) => ({ type: e.type, at: e.at, by: e.actorId === null ? "sistem" : e.actorId === userId ? "siz" : "karşı taraf ya da yönetici", meta: e.meta })),
      })),
      ratingsGiven,
      ratingsReceived,
      reportsFiled,
      calls: await db.select({ loadId: callLogs.loadPostId, at: callLogs.createdAt }).from(callLogs).where(eq(callLogs.callerId, userId)).orderBy(asc(callLogs.createdAt)),
      notifications: await db
        .select({ type: notifications.type, title: notifications.title, body: notifications.body, createdAt: notifications.createdAt, readAt: notifications.readAt })
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(asc(notifications.createdAt)),
      favoriteCarriers: favorites,
    };
  }
}
