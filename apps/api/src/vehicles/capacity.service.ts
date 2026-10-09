import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  CAPACITY_STATUS_LABELS,
  dateRangeError,
  LOAD_DATE_LIMITS,
  trDay,
  type CapacityStatus,
  type CreateCapacityInput,
  type UpdateCapacityInput,
} from "@nakliye/shared";
import { and, desc, eq, gte, inArray, lt, lte, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DB, type Db } from "../db/db.module.js";
import { capacityPosts, districts, provinces, vehicles } from "../db/schema.js";
import { vehicleBusy, vehicleBusyMessage } from "../jobs/vehicle-busy.js";
import { MatchingService } from "../matching/matching.service.js";

const PAGE_SIZE = 20;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const od = alias(districts, "od");
const op = alias(provinces, "op");
const dd = alias(districts, "dd");
const dp = alias(provinces, "dp");

/**
 * Boş araç ilanı (FR-12, UC-07): "şu tarihte şuradayım, şuraya gidiyorum" (varış null = her yer).
 * Kural: bir aracın tarihleri çakışan en fazla bir aktif ilanı olur (araç aynı anda iki yerde boş olamaz).
 */
@Injectable()
export class CapacityService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly matching: MatchingService,
  ) {}

  async create(userId: string, input: CreateCapacityInput, now = new Date()) {
    this.checkDates(input.availableFrom, input.availableTo, now);
    const geoms = await this.districtGeoms(input.originDistrictId, input.destDistrictId);

    const id = await this.db.transaction(async (tx) => {
      // Araç satırı kilitlenir: aynı araç için aynı anda gelen iki ilan çakışma kontrolünü birlikte geçemesin
      const [v] = await tx
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.ownerUserId, userId), eq(vehicles.status, "aktif")))
        .for("update");
      if (!v) throw new NotFoundException("Araç bulunamadı");
      await this.assertNoOverlap(tx, input.vehicleId, input.availableFrom, input.availableTo, now);
      const [row] = await tx
        .insert(capacityPosts)
        .values({ ...input, carrierId: userId, originGeom: geoms.origin, destGeom: geoms.dest })
        .returning({ id: capacityPosts.id });
      return row!.id;
    });
    this.matching.schedule("capacity", id); // UC-07: yayınla → eşleşen yükler
    return this.get(userId, id);
  }

  async mine(userId: string, page: number) {
    const rows = await this.select()
      .where(eq(capacityPosts.carrierId, userId))
      .orderBy(desc(capacityPosts.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    return { items: rows.slice(0, PAGE_SIZE).map((r) => this.view(r)), page, hasMore: rows.length > PAGE_SIZE };
  }

  /** Şimdilik yalnız sahibi görür; yük sahipleri boş araçları eşleştirme üzerinden görecek. */
  async get(userId: string, id: string) {
    const [row] = await this.select().where(and(eq(capacityPosts.id, id), eq(capacityPosts.carrierId, userId)));
    if (!row) throw new NotFoundException("İlan bulunamadı");
    return this.view(row);
  }

  async update(userId: string, id: string, patch: UpdateCapacityInput, now = new Date()) {
    await this.db.transaction(async (tx) => {
      const current = await this.ownActive(tx, userId, id);
      const merged = {
        originDistrictId: patch.originDistrictId ?? current.originDistrictId,
        destDistrictId: patch.destDistrictId !== undefined ? patch.destDistrictId : current.destDistrictId,
        availableFrom: patch.availableFrom ?? current.availableFrom,
        availableTo: patch.availableTo ?? current.availableTo,
      };
      this.checkDates(merged.availableFrom, merged.availableTo, now);
      const geoms = await this.districtGeoms(merged.originDistrictId, merged.destDistrictId);
      await this.assertNoOverlap(tx, current.vehicleId, merged.availableFrom, merged.availableTo, now, id);
      await tx
        .update(capacityPosts)
        .set({ ...merged, originGeom: geoms.origin, destGeom: geoms.dest, matchedAt: null })
        .where(eq(capacityPosts.id, id));
    });
    this.matching.schedule("capacity", id);
    return this.get(userId, id);
  }

  async close(userId: string, id: string, reason: "doldu" | "iptal") {
    await this.db.transaction(async (tx) => {
      await this.ownActive(tx, userId, id);
      await tx
        .update(capacityPosts)
        .set({ status: reason === "doldu" ? "kapandi" : "iptal" })
        .where(eq(capacityPosts.id, id));
    });
    return this.get(userId, id);
  }

  /** Zamanlayıcı: müsaitlik tarihi geçen ilanlar süresi doldu olur. */
  async expire(now = new Date()): Promise<number> {
    const rows = await this.db
      .update(capacityPosts)
      .set({ status: "suresi_doldu" })
      .where(and(eq(capacityPosts.status, "aktif"), lt(capacityPosts.availableTo, trDay(now))))
      .returning({ id: capacityPosts.id });
    return rows.length;
  }

  // ── Yardımcılar ────────────────────────────────────────────────────

  private checkDates(from: string, to: string, now: Date) {
    const error = dateRangeError(from, to, now, LOAD_DATE_LIMITS, "Müsaitlik");
    if (error) throw new BadRequestException(error);
  }

  private async districtGeoms(originId: number, destId: number | null) {
    const ids = destId ? [originId, destId] : [originId];
    const found = await this.db.select({ id: districts.id, geom: districts.geom }).from(districts).where(inArray(districts.id, ids));
    const origin = found.find((d) => d.id === originId);
    const dest = destId ? found.find((d) => d.id === destId) : undefined;
    if (!origin || (destId && !dest)) throw new BadRequestException("Kalkış ya da varış ilçesi bulunamadı");
    return { origin: origin.geom, dest: dest?.geom ?? null };
  }

  /** Aynı aracın tarihleri çakışan (iki uç dahil) başka aktif ilanı ya da teslim edilmemiş işi varsa 409. */
  private async assertNoOverlap(tx: Tx, vehicleId: string, from: string, to: string, now: Date, exceptId?: string) {
    const where: SQL[] = [
      eq(capacityPosts.vehicleId, vehicleId),
      eq(capacityPosts.status, "aktif"),
      gte(capacityPosts.availableTo, trDay(now)), // süresi geçmiş ama henüz düşürülmemiş ilan engel olmasın
      lte(capacityPosts.availableFrom, to),
      gte(capacityPosts.availableTo, from),
    ];
    if (exceptId) where.push(ne(capacityPosts.id, exceptId));
    const [clash] = await tx
      .select({ from: capacityPosts.availableFrom, to: capacityPosts.availableTo })
      .from(capacityPosts)
      .where(and(...where))
      .limit(1);
    if (clash) {
      throw new ConflictException(`Bu araç için ${clash.from} – ${clash.to} tarihlerinde zaten boş araç ilanı var`);
    }
    // Araç o günlerde bir işteyse boş değildir (kabul zaten çakışan ilanları kapatıyor; sonradan açılmasın)
    const busy = await vehicleBusy(tx, vehicleId, from, to);
    if (busy) throw new ConflictException(vehicleBusyMessage(busy));
  }

  private async ownActive(tx: Tx, userId: string, id: string) {
    const [c] = await tx
      .select()
      .from(capacityPosts)
      .where(and(eq(capacityPosts.id, id), eq(capacityPosts.carrierId, userId)))
      .for("update");
    if (!c) throw new NotFoundException("İlan bulunamadı");
    if (c.status !== "aktif") {
      throw new ConflictException(`İlan "${CAPACITY_STATUS_LABELS[c.status as CapacityStatus]}" durumunda; değiştirilemez`);
    }
    return c;
  }

  private select() {
    return this.db
      .select({
        post: capacityPosts,
        vehicle: {
          id: vehicles.id,
          plate: vehicles.plate,
          vehicleType: vehicles.vehicleType,
          bodyType: vehicles.bodyType,
          capacityTon: vehicles.capacityTon,
          volumeM3: vehicles.volumeM3,
        },
        origin: { districtId: od.id, district: od.name, provinceId: op.id, province: op.name },
        dest: { districtId: dd.id, district: dd.name, provinceId: dp.id, province: dp.name },
      })
      .from(capacityPosts)
      .innerJoin(vehicles, eq(vehicles.id, capacityPosts.vehicleId))
      .innerJoin(od, eq(od.id, capacityPosts.originDistrictId))
      .innerJoin(op, eq(op.id, od.provinceId))
      .leftJoin(dd, eq(dd.id, capacityPosts.destDistrictId))
      .leftJoin(dp, eq(dp.id, dd.provinceId))
      .$dynamic();
  }

  private view(r: Awaited<ReturnType<CapacityService["select"]>>[number]) {
    const c = r.post;
    return {
      id: c.id,
      status: c.status,
      vehicle: r.vehicle,
      origin: r.origin,
      dest: r.post.destDistrictId ? r.dest : null, // null = her yere giderim
      availableFrom: c.availableFrom,
      availableTo: c.availableTo,
      createdAt: c.createdAt,
    };
  }
}
