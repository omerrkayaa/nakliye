import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  isVerifiedBadge,
  RATING_PARAMS,
  RATING_TAGS_FOR,
  ratingDeadline,
  type CreateRatingInput,
  type RatingTag,
} from "@nakliye/shared";
import { and, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { DB, type Db } from "../db/db.module.js";
import { companies, jobs, ratings, users } from "../db/schema.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { TrustService } from "./trust.service.js";

const DAY = 86_400_000;
type RatingRow = typeof ratings.$inferSelect;
type JobForRating = Pick<typeof jobs.$inferSelect, "id" | "shipperId" | "carrierId" | "status" | "completedAt">;

const dayMonth = (d: Date) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" }).format(d);

/** Puanlama (FR-40, BR-31) ve itibar profili (FR-41). Puanlar kör: iki taraf da puanlayınca ya da süre bitince görünür. */
@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly trust: TrustService,
    private readonly notifications: NotificationsService,
  ) {}

  async rate(userId: string, jobId: string, input: CreateRatingInput, now = new Date()) {
    const r = await this.db.transaction(async (tx) => {
      // İş satırı kilitlenir: iki taraf aynı anda puanlarsa ikincisi birincinin puanını görür. Kilitsiz ikisi de
      // "karşı taraf henüz puanlamadı" sanır ve puanlar süre bitene kadar gizli kalırdı.
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
      if (!job || (job.shipperId !== userId && job.carrierId !== userId)) throw new NotFoundException("İş bulunamadı");
      if (job.status !== "tamamlandi" || !job.completedAt) throw new ConflictException("Yalnız tamamlanmış iş puanlanabilir");
      if (now.getTime() >= ratingDeadline(job.completedAt).getTime()) throw new ConflictException("Puanlama süresi doldu");

      const rateeRole = job.shipperId === userId ? "carrier" : "shipper";
      const rateeId = rateeRole === "carrier" ? job.carrierId : job.shipperId;
      const wrong = input.tags.filter((t) => !RATING_TAGS_FOR[rateeRole].includes(t));
      if (wrong.length > 0) {
        throw new BadRequestException(`Bu etiket ${rateeRole === "carrier" ? "nakliyeciye" : "yük sahibine"} verilemez: ${wrong.join(", ")}`);
      }

      const existing = await tx.select({ raterId: ratings.raterId }).from(ratings).where(eq(ratings.jobId, job.id));
      if (existing.some((e) => e.raterId === userId)) throw new ConflictException("Bu işi zaten puanladınız");
      const otherRated = existing.some((e) => e.raterId === rateeId);

      await tx.insert(ratings).values({
        jobId: job.id,
        raterId: userId,
        rateeId,
        stars: input.stars,
        tags: input.tags,
        comment: input.comment || null,
        revealedAt: otherRated ? now : null,
        createdAt: now,
      });
      if (otherRated) {
        await tx.update(ratings).set({ revealedAt: now }).where(and(eq(ratings.jobId, job.id), isNull(ratings.revealedAt)));
      }
      return { job, rateeId, revealed: otherRated };
    });

    // Yan etkiler commit'ten sonra
    if (r.revealed) {
      await this.trust.refresh(r.job.shipperId, r.job.carrierId);
    } else {
      await this.notifications
        .notify(r.rateeId, {
          type: "job_update",
          title: "Puanlandınız",
          body: `Karşı taraf sizi puanladı. Puanı görmek için siz de puanlayın (son gün ${dayMonth(ratingDeadline(r.job.completedAt!))}).`,
          data: { type: "job", jobId: r.job.id },
        })
        .catch((e: Error) => this.logger.warn(`Bildirim gitmedi (${r.job.id}): ${e.message}`));
    }
    return this.forJob(userId, r.job, now);
  }

  /** İş detayındaki puan bloğu: verdiğim puan, aldığım puan (görünür değilse yalnız verildiği bilinir), son gün. */
  async forJob(userId: string, job: JobForRating, now = new Date()) {
    const rows = await this.db.select().from(ratings).where(eq(ratings.jobId, job.id));
    const given = rows.find((x) => x.raterId === userId);
    const received = rows.find((x) => x.raterId !== userId);
    const deadline = job.status === "tamamlandi" && job.completedAt ? ratingDeadline(job.completedAt) : null;
    return {
      deadline,
      canRate: deadline !== null && !given && now.getTime() < deadline.getTime(),
      given: given ? this.view(given) : null,
      received: received ? (received.revealedAt ? { revealed: true, ...this.view(received) } : { revealed: false }) : null,
    };
  }

  /** İtibar profili (FR-41): görünür puanlar, etiket sayıları, tamamlanan iş, iptal oranı, üyelik süresi, son puanlar (ad gizli). */
  async reputation(userId: string) {
    const [u] = await this.db
      .select({ id: users.id, name: users.name, level: users.verificationLevel, trust: users.trustScore, createdAt: users.createdAt, company: companies.title })
      .from(users)
      .leftJoin(companies, eq(companies.ownerUserId, users.id))
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!u) throw new NotFoundException("Kullanıcı bulunamadı");

    const s = await this.trust.stats(this.db, userId);
    const visible = and(eq(ratings.rateeId, userId), isNotNull(ratings.revealedAt));
    const tagRows = await this.db
      .select({ tag: sql<RatingTag>`t.tag`, n: sql<number>`count(*)::int` })
      .from(sql`${ratings}, unnest(${ratings.tags}) as t(tag)`)
      .where(visible)
      .groupBy(sql`t.tag`);
    const recent = await this.db
      .select({ rating: ratings, shipperId: jobs.shipperId })
      .from(ratings)
      .innerJoin(jobs, eq(jobs.id, ratings.jobId))
      .where(visible)
      .orderBy(desc(ratings.revealedAt), desc(ratings.createdAt))
      .limit(RATING_PARAMS.publicRecent);

    return {
      id: u.id,
      displayName: u.company ?? u.name,
      verified: isVerifiedBadge(u.level),
      trustScore: u.trust,
      memberSince: u.createdAt,
      rating: {
        // Gösterilen düz ortalama; güven skoru Bayes ortalamasıyla yumuşatılmış olanı kullanır
        average: s.avgStars === null ? null : Math.round(s.avgStars * 10) / 10,
        count: s.ratingCount,
        tags: Object.fromEntries(tagRows.map((t) => [t.tag, t.n])),
      },
      completedJobs: s.completedJobs,
      cancelRate: s.totalJobs > 0 ? Math.round((s.cancelledJobs / s.totalJobs) * 100) / 100 : 0,
      recent: recent.map((x) => ({
        ...this.view(x.rating),
        // Puanlayanın adı gösterilmez (gizlilik, misilleme); yalnız rolü
        raterRole: x.rating.raterId === x.shipperId ? "shipper" : "carrier",
      })),
    };
  }

  /** Zamanlayıcı: puanlama süresi biten işlerin gizli puanları görünür olur ve skora girer. */
  async revealExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RATING_PARAMS.windowDays * DAY);
    const due = this.db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.status, "tamamlandi"), lte(jobs.completedAt, cutoff)));
    const rows = await this.db
      .update(ratings)
      .set({ revealedAt: now })
      .where(and(isNull(ratings.revealedAt), inArray(ratings.jobId, due)))
      .returning({ rateeId: ratings.rateeId });
    await this.trust.refresh(...rows.map((x) => x.rateeId));
    return rows.length;
  }

  private view(r: RatingRow) {
    return { stars: r.stars, tags: r.tags, comment: r.comment, at: r.createdAt };
  }
}
