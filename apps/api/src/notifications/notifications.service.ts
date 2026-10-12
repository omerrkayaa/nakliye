import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { NotificationType } from "@nakliye/shared";
import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { DB, type Db, type Tx } from "../db/db.module.js";
import { notifications } from "../db/schema.js";
import { PushService, type PushMessage } from "./push.service.js";

const PAGE_SIZE = 30;

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Tekilleştirme anahtarı: aynı kullanıcıya aynı anahtarla ikinci bildirim gitmez (BR-22) */
  refKey?: string;
  actions?: PushMessage["actions"];
}

/**
 * Bildirimi kullanıcı kilidi altında kurar; null dönerse bildirim gitmez. Gönderip göndermeme kararı aynı kullanıcıya
 * giden başka bildirimlerle yarışmamalıysa kullanılır (ör. nakliyeci bu yükü başka bir bildirimden öğrendi mi).
 */
export type NotifyBuilder = (tx: Tx) => Promise<NotifyInput | null>;

export interface NotifyLimit {
  /** Son 1 saatte bu tiplerden en fazla kaç bildirim (BR-22) */
  perHour: number;
  types: readonly NotificationType[];
}

/** Bildirim = uygulama içi kayıt (A14) + push. Kayıt önce yazılır; push gitmese de kullanıcı uygulamada görür. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly push: PushService,
  ) {}

  /**
   * @returns bildirim gönderildiyse true; aynı refKey ile daha önce gönderilmişse ya da saatlik sınır dolduysa false.
   * Saatlik sınırda sayma ile ekleme kullanıcı başına kilit (transaction'a bağlı advisory lock) altında: aynı anda
   * gelen eşleşmeler sırayla sayar (kilitsizken art arda 6 ilanda 6. bildirim de gidiyordu; testte görüldü).
   * Tekilleştirme (refKey) veritabanı indeksiyle kesindir. `input` bir NotifyBuilder ise aynı kilit altında çalışır.
   */
  async notify(userId: string, input: NotifyInput | NotifyBuilder, limit?: NotifyLimit, now = new Date()): Promise<boolean> {
    let n: NotifyInput | null = typeof input === "function" ? null : input;
    const row = await this.db.transaction(async (tx) => {
      if (limit || !n) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`notify:${userId}`}))`);
      if (limit) {
        const since = new Date(now.getTime() - 3_600_000);
        const [{ sent }] = (await tx
          .select({ sent: count() })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), inArray(notifications.type, [...limit.types]), gte(notifications.createdAt, since)))) as [
          { sent: number },
        ];
        if (sent >= limit.perHour) return null;
      }
      if (typeof input === "function") n = await input(tx);
      if (!n) return null;
      const [inserted] = await tx
        .insert(notifications)
        .values({ userId, type: n.type, title: n.title, body: n.body, data: n.data ?? {}, refKey: n.refKey ?? null, createdAt: now })
        .onConflictDoNothing({ target: [notifications.userId, notifications.refKey] })
        .returning({ id: notifications.id });
      return inserted ?? null;
    });
    if (!row || !n) return false;

    await this.push
      .sendToUser(userId, { title: n.title, body: n.body, data: { ...n.data, notificationId: row.id }, actions: n.actions })
      .catch((e: Error) => this.logger.warn(`Push gönderilemedi (${userId}): ${e.message}`));
    return true;
  }

  async list(userId: string, page: number) {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    const [{ unread }] = (await this.db
      .select({ unread: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))) as [{ unread: number }];
    return {
      unread,
      items: rows.slice(0, PAGE_SIZE).map(({ refKey, userId: _u, ...n }) => n),
      page,
      hasMore: rows.length > PAGE_SIZE,
    };
  }

  async markRead(userId: string, id: string, now = new Date()) {
    const [row] = await this.db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (!row) {
      const [exists] = await this.db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
      if (!exists) throw new NotFoundException("Bildirim bulunamadı");
    }
  }

  async markAllRead(userId: string, now = new Date()) {
    await this.db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }
}
