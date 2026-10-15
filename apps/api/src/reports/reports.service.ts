import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  ABUSE_LIMITS,
  isQualifiedReporter,
  shouldForceReconfirm,
  VISIBLE_LOAD_STATUSES,
  type CreateReportInput,
} from "@nakliye/shared";
import { and, count, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { DB, type Db } from "../db/db.module.js";
import { SettingsService } from "../settings/settings.service.js";
import { callLogs, loadPosts, reports, users } from "../db/schema.js";
import { ConfirmationService } from "../loads/confirmation.service.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly confirmation: ConfirmationService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Şikayet (FR-17, UC-13). Aynı kişi aynı hedefi aynı sebeple tekrar bildirirse kayıt tazelenir (yeni satır açılmaz):
   * böylece sahibi "geçerli" dedikten sonra yük gerçekten gittiyse aynı nakliyeci yeniden bildirebilir.
   * "Yük yok" bildirimi BR-05'i tetikleyebilir.
   */
  async create(userId: string, input: CreateReportInput, now = new Date()) {
    const since = new Date(now.getTime() - 24 * 3_600_000);
    const [{ n }] = (await this.db
      .select({ n: count() })
      .from(reports)
      .where(and(eq(reports.reporterId, userId), gte(reports.createdAt, since)))) as [{ n: number }];
    if (n >= ABUSE_LIMITS.reportsPerDay) {
      throw new HttpException("Günlük şikayet sınırına ulaştınız. Yarın tekrar deneyin.", HttpStatus.TOO_MANY_REQUESTS);
    }

    if (input.targetType === "user") {
      if (input.targetId === userId) throw new BadRequestException("Kendinizi şikayet edemezsiniz");
      const [target] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.targetId), isNull(users.deletedAt)));
      if (!target) throw new NotFoundException("Kullanıcı bulunamadı");
      return { id: await this.upsert(this.db, userId, input, now) };
    }

    const result = await this.db.transaction(async (tx) => {
      // İlan satırı kilitlenir: aynı anda gelen iki şikayet birbirini görsün. Kilit olmasa ikisi de yalnız
      // kendini sayar ("1"), eşik (2) hiç görülmez ve BR-05 kaçar.
      const [load] = await tx
        .select({ id: loadPosts.id, shipperId: loadPosts.shipperId, status: loadPosts.status, lastConfirmedAt: loadPosts.lastConfirmedAt })
        .from(loadPosts)
        .where(eq(loadPosts.id, input.targetId))
        .for("update");
      if (!load || !VISIBLE_LOAD_STATUSES.includes(load.status)) throw new NotFoundException("İlan bulunamadı");
      if (load.shipperId === userId) throw new BadRequestException("Kendi ilanınızı şikayet edemezsiniz");

      const id = await this.upsert(tx, userId, input, now);
      if (input.reason !== "yuk_yok" || load.status !== "teyitli") return { id, trigger: false };
      return { id, trigger: shouldForceReconfirm(await this.qualifiedReporters(tx, load.id, load.lastConfirmedAt), await this.settings.confirmation()) };
    });

    // Anında teyit ayrı transaction'da: ilanı yeniden kilitler ve "teyitli" mi diye tekrar bakar (idempotent)
    if (result.trigger) await this.confirmation.forceReconfirm(input.targetId, now);
    return { id: result.id };
  }

  private async upsert(tx: Tx | Db, userId: string, input: CreateReportInput, now: Date): Promise<string> {
    const [row] = await tx
      .insert(reports)
      .values({ reporterId: userId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, note: input.note ?? null, createdAt: now })
      .onConflictDoUpdate({
        target: [reports.reporterId, reports.targetType, reports.targetId, reports.reason],
        set: { createdAt: now, note: input.note ?? null, status: "acik" },
      })
      .returning({ id: reports.id });
    return row!.id;
  }

  /**
   * Son teyitten sonra "yük yok" diyen farklı ve *sayılan* şikayetçi sayısı (BR-05). Teyitten önceki şikayetler
   * sayılmaz: sahibi "geçerli" dedikten sonra eski şikayetler ilanı tekrar düşürmesin.
   * Kim sayılır: shared isQualifiedReporter (doğrulanmış ya da bu ilanı aramış).
   */
  private async qualifiedReporters(tx: Tx, loadId: string, since: Date): Promise<number> {
    const rows = await tx
      .select({
        verificationLevel: users.verificationLevel,
        calledThisLoad: sql<boolean>`exists (select 1 from ${callLogs} where ${callLogs.callerId} = ${reports.reporterId} and ${callLogs.loadPostId} = ${loadId})`,
      })
      .from(reports)
      .innerJoin(users, eq(users.id, reports.reporterId))
      .where(
        and(
          eq(reports.targetType, "load_post"),
          eq(reports.targetId, loadId),
          eq(reports.reason, "yuk_yok"),
          gt(reports.createdAt, since),
        ),
      );
    // Tekil indeks (şikayetçi, hedef, sebep) sayesinde her şikayetçi tek satır
    return rows.filter((r) => isQualifiedReporter(r)).length;
  }
}
