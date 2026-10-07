import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ACTIVE_JOB_STATUSES, type CreateVehicleInput, type UpdateVehicleInput } from "@nakliye/shared";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { DB, type Db } from "../db/db.module.js";
import { capacityPosts, jobs, offers, vehicles } from "../db/schema.js";

const PG_UNIQUE_VIOLATION = "23505";

/** Araçlar (FR-04, UC-02). Belgeler (ruhsat, K belgesi) dosya deposu kararından sonra eklenecek. */
@Injectable()
export class VehiclesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  list(userId: string) {
    return this.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.ownerUserId, userId), eq(vehicles.status, "aktif")))
      .orderBy(asc(vehicles.createdAt))
      .then((rows) => rows.map((v) => this.view(v)));
  }

  async create(userId: string, input: CreateVehicleInput) {
    const [existing] = await this.db
      .select({ ownerUserId: vehicles.ownerUserId })
      .from(vehicles)
      .where(and(eq(vehicles.plate, input.plate), ne(vehicles.status, "silindi")));
    if (existing) throw this.plateConflict(existing.ownerUserId === userId);
    try {
      const [v] = await this.db
        .insert(vehicles)
        .values({ ...input, volumeM3: input.volumeM3 ?? null, ownerUserId: userId })
        .returning();
      return this.view(v!);
    } catch (e) {
      // Kontrol ile ekleme arasında başka biri aynı plakayı eklediyse
      const err = e as { code?: string; cause?: { code?: string } };
      if ((err.cause?.code ?? err.code) === PG_UNIQUE_VIOLATION) throw this.plateConflict(false);
      throw e;
    }
  }

  async update(userId: string, id: string, patch: UpdateVehicleInput) {
    await this.ownActive(userId, id);
    const [v] = await this.db.update(vehicles).set(patch).where(eq(vehicles.id, id)).returning();
    return this.view(v!);
  }

  /**
   * Aracı siler: kayıt saklanır (ilan ve iş geçmişi ona bağlı), durum "silindi" olur, plaka serbest kalır.
   * Aktif boş araç ilanları iptal, bekleyen teklifleri geri çekilir. Aktif işteki araç silinemez.
   */
  async remove(userId: string, id: string) {
    await this.db.transaction(async (tx) => {
      const [v] = await tx
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.id, id), eq(vehicles.ownerUserId, userId), eq(vehicles.status, "aktif")))
        .for("update");
      if (!v) throw new NotFoundException("Araç bulunamadı");
      const [busy] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.vehicleId, id), inArray(jobs.status, [...ACTIVE_JOB_STATUSES])))
        .limit(1);
      if (busy) throw new ConflictException("Araç devam eden bir işte; iş bitmeden silinemez");
      await tx.update(vehicles).set({ status: "silindi" }).where(eq(vehicles.id, id));
      await tx
        .update(offers)
        .set({ status: "geri_cekildi" })
        .where(and(eq(offers.vehicleId, id), eq(offers.status, "beklemede")));
      await tx
        .update(capacityPosts)
        .set({ status: "iptal" })
        .where(and(eq(capacityPosts.vehicleId, id), eq(capacityPosts.status, "aktif")));
    });
  }

  private async ownActive(userId: string, id: string) {
    const [v] = await this.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.ownerUserId, userId), eq(vehicles.status, "aktif")));
    if (!v) throw new NotFoundException("Araç bulunamadı");
    return v;
  }

  private plateConflict(own: boolean) {
    return new ConflictException(
      own ? "Bu plaka zaten araçlarınızda kayıtlı" : "Bu plaka başka bir hesapta kayıtlı. Araç sizinse destek ile iletişime geçin.",
    );
  }

  private view(v: typeof vehicles.$inferSelect) {
    return {
      id: v.id,
      plate: v.plate,
      vehicleType: v.vehicleType,
      bodyType: v.bodyType,
      capacityTon: v.capacityTon,
      volumeM3: v.volumeM3,
      createdAt: v.createdAt,
    };
  }
}
