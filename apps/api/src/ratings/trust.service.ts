import { Inject, Injectable, Logger } from "@nestjs/common";
import { trustScore } from "@nakliye/shared";
import { and, count, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { DB, type Db, type Tx } from "../db/db.module.js";
import { jobs, loadPosts, ratings, reports, users } from "../db/schema.js";

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
      const [u] = await tx.select({ level: users.verificationLevel }).from(users).where(eq(users.id, userId)).for("update");
      if (!u) return null;
      const s = await this.stats(tx, userId);
      const score = trustScore({
        avgStars: s.avgStars,
        ratingCount: s.ratingCount,
        completedJobs: s.completedJobs,
        verificationLevel: Math.min(2, Math.max(0, u.level)) as 0 | 1 | 2,
        cancelRate: s.totalJobs > 0 ? s.cancelledJobs / s.totalJobs : 0,
        reportRate: s.upheldReports / Math.max(1, s.loadPosts + s.totalJobs),
      });
      await tx.update(users).set({ trustScore: score }).where(eq(users.id, userId));
      return score;
    });
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
