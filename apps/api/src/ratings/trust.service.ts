import { Inject, Injectable, Logger } from "@nestjs/common";
import { trDay, trustScore, verificationLevel } from "@nakliye/shared";
import { and, count, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { DB, type Db, type Tx } from "../db/db.module.js";
import { companies, documents, jobs, loadPosts, ratings, reports, userRoles, users, vehicles } from "../db/schema.js";

/** Yönetici şikayeti haklı bulunca verilen durum (FR-51; admin/admin.service.ts resolveReport). */
const REPORT_UPHELD = "hakli";

export interface TrustStats {
  ratingCount: number;
  /** Görünür puanların düz ortalaması; puan yoksa null */
  avgStars: number | null;
  totalJobs: number;
  completedJobs: number;
  /** Bu kullanıcının iptal ettiği işler (karşı tarafın iptali mağdura yazılmaz) */
  cancelledJobs: number;
  loadPosts: number;
  upheldReports: number;
}

/**
 * Güven skoru (BR-30, FR-42). Girdileri değiştiren olaylarda yeniden hesaplanır: puan görünür oldu, iş oluştu,
 * tamamlandı ya da iptal edildi. Puanlar yalnız görünür olunca sayılır (kör puanlama).
 * BR-06 (teyitsiz düşen ilan) formülde terimi olmadığı için henüz uygulanmadı (rehber §4).
 */
@Injectable()
export class TrustService {
  private readonly logger = new Logger(TrustService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Asıl işlem commit edildikten sonra çağrılır; hata isteği düşürmez (skor bir sonraki olayda düzelir). */
  async refresh(...userIds: string[]) {
    for (const id of new Set(userIds)) {
      await this.recompute(id).catch((e: Error) => this.logger.warn(`Güven skoru hesaplanamadı (${id}): ${e.message}`));
    }
  }

  async recompute(userId: string): Promise<number | null> {
    return this.db.transaction(async (tx) => {
      // Kullanıcı satırı kilitlenir: iki olay aynı anda hesaplarsa sonraki öncekinin verisini görerek yazar.
      // Kilitsiz, eski veriyle hesaplayan yavaş istek yeni skorun üstüne yazabilirdi.
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      if (!u) return null;
      const s = await this.stats(tx, userId);
      const level = await this.level(tx, userId);
      const score = trustScore({
        avgStars: s.avgStars,
        ratingCount: s.ratingCount,
        completedJobs: s.completedJobs,
        verificationLevel: level,
        cancelRate: s.totalJobs > 0 ? s.cancelledJobs / s.totalJobs : 0,
        reportRate: s.upheldReports / Math.max(1, s.loadPosts + s.totalJobs),
      });
      await tx.update(users).set({ trustScore: score, verificationLevel: level }).where(eq(users.id, userId));
      return score;
    });
  }

  /**
   * BR-10 doğrulama seviyesi (shared verificationLevel): onaylı ve süresi geçmemiş belgeler, etkin araçlar, vergi levhası
   * onaylı firma, yük sahibi olarak tamamlanan işler. Skorla aynı anda yazılır; girdisi değişen her olay (belge kararı,
   * firma kimliği, rol, araç silme, iş tamamlama, belge süresi) refresh çağırır.
   */
  private async level(tx: Tx, userId: string) {
    const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    const approved = await tx
      .select({ type: documents.type, vehicleId: documents.vehicleId, expiresAt: documents.expiresAt })
      .from(documents)
      .where(and(eq(documents.ownerUserId, userId), eq(documents.status, "onay")));
    const active = await tx.select({ id: vehicles.id }).from(vehicles).where(and(eq(vehicles.ownerUserId, userId), eq(vehicles.status, "aktif")));
    const [company] = await tx.select({ verifiedAt: companies.verifiedAt }).from(companies).where(eq(companies.ownerUserId, userId));
    const [shipped] = await tx.select({ n: count() }).from(jobs).where(and(eq(jobs.shipperId, userId), eq(jobs.status, "tamamlandi")));
    return verificationLevel({
      roles: roles.map((r) => r.role),
      approved,
      activeVehicleIds: active.map((v) => v.id),
      companyVerified: !!company?.verifiedAt,
      completedShipperJobs: shipped?.n ?? 0,
      today: trDay(new Date()),
    });
  }

  /**
   * Listeler için (yük akışı kartı, A6): kullanıcı başına görünür puan ortalaması, puan sayısı ve tamamlanan iş —
   * `stats` ile aynı kurallar (kör puanlama: açılmamış puan sayılmaz; iş iki rolde de sayılır), tek sorguda.
   */
  async reputationMany(userIds: string[]): Promise<Map<string, { rating: number | null; ratingCount: number; completedJobs: number }>> {
    const ids = [...new Set(userIds)];
    const out = new Map(ids.map((id) => [id, { rating: null as number | null, ratingCount: 0, completedJobs: 0 }]));
    if (ids.length === 0) return out;
    const rated = await this.db
      .select({ id: ratings.rateeId, n: count(), avg: sql<number | null>`avg(${ratings.stars})::float` })
      .from(ratings)
      .where(and(inArray(ratings.rateeId, ids), isNotNull(ratings.revealedAt)))
      .groupBy(ratings.rateeId);
    for (const r of rated) Object.assign(out.get(r.id)!, { rating: r.avg === null ? null : Math.round(r.avg * 10) / 10, ratingCount: r.n });
    const done = await this.db
      .select({ shipperId: jobs.shipperId, carrierId: jobs.carrierId })
      .from(jobs)
      .where(and(eq(jobs.status, "tamamlandi"), or(inArray(jobs.shipperId, ids), inArray(jobs.carrierId, ids))));
    for (const j of done) for (const id of new Set([j.shipperId, j.carrierId])) if (out.has(id)) out.get(id)!.completedJobs++;
    return out;
  }

  async stats(db: Db | Tx, userId: string): Promise<TrustStats> {
    const [r] = await db
      .select({ n: count(), avg: sql<number | null>`avg(${ratings.stars})::float` })
      .from(ratings)
      .where(and(eq(ratings.rateeId, userId), isNotNull(ratings.revealedAt)));
    const [j] = await db
      .select({
        total: count(),
        completed: sql<number>`count(*) filter (where ${jobs.status} = 'tamamlandi')::int`,
        cancelled: sql<number>`count(*) filter (where ${jobs.status} = 'iptal' and ${jobs.cancelledBy} = ${userId})::int`,
      })
      .from(jobs)
      .where(or(eq(jobs.shipperId, userId), eq(jobs.carrierId, userId)));
    const ownLoads = db.select({ id: loadPosts.id }).from(loadPosts).where(eq(loadPosts.shipperId, userId));
    const [l] = await db.select({ n: count() }).from(loadPosts).where(eq(loadPosts.shipperId, userId));
    const [rep] = await db
      .select({ n: count() })
      .from(reports)
      .where(
        and(
          eq(reports.status, REPORT_UPHELD),
          or(
            and(eq(reports.targetType, "user"), eq(reports.targetId, userId)),
            and(eq(reports.targetType, "load_post"), inArray(reports.targetId, ownLoads)),
          ),
        ),
      );
    return {
      ratingCount: r!.n,
      avgStars: r!.avg,
      totalJobs: j!.total,
      completedJobs: j!.completed,
      cancelledJobs: j!.cancelled,
      loadPosts: l!.n,
      upheldReports: rep!.n,
    };
  }
}
