import { Global, Inject, Injectable, Module } from "@nestjs/common";
import type { AuditAction, AuditTarget } from "@nakliye/shared";
import { asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DB, type Db, type Tx } from "../db/db.module.js";
import { adminAuditLog, users } from "../db/schema.js";

const PAGE_SIZE = 30;
const admin = alias(users, "audit_admin");
const subject = alias(users, "audit_subject");

export interface AuditEntry {
  adminId: string;
  action: AuditAction;
  targetType: AuditTarget;
  targetId: string;
  /** İşlemin etkilediği kişi (belgenin, ilanın sahibi; şikayetin hedefi; itirazın tarafı; askıya alınan) */
  subjectUserId: string | null;
  note?: string | null;
}

/**
 * Yönetici işlem kaydı (NFR-05 erişim logları, FR-50–51 hesap verebilirlik): kim, ne zaman, hangi kayıt üzerinde ne
 * yaptı, kimi etkiledi. Belge açma da kayda geçer (kişisel veri erişimi). Kişi kendi veri dökümünde hakkındaki işlemleri
 * görür (yöneticinin kimliği olmadan: veri sorumlusu platformdur); hesabı silinince kayıt kalır, serbest metin silinir.
 * Karar ile kayıt aynı işlemde yazılır: biri olup öteki olmasın.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(entry: AuditEntry | AuditEntry[], db: Db | Tx = this.db): Promise<void> {
    const rows = Array.isArray(entry) ? entry : [entry];
    if (rows.length) await db.insert(adminAuditLog).values(rows.map((e) => ({ ...e, note: e.note ?? null })));
  }

  /** Yönetim paneli: yeniden eskiye; yönetici ve etkilenen kişinin adı */
  async list(page: number) {
    const rows = await this.db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        targetType: adminAuditLog.targetType,
        targetId: adminAuditLog.targetId,
        note: adminAuditLog.note,
        createdAt: adminAuditLog.createdAt,
        admin: { id: admin.id, name: admin.name, phone: admin.phone },
        subject: { id: subject.id, name: subject.name, status: subject.status },
      })
      .from(adminAuditLog)
      .innerJoin(admin, eq(admin.id, adminAuditLog.adminId))
      .leftJoin(subject, eq(subject.id, adminAuditLog.subjectUserId))
      .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    return {
      items: rows.slice(0, PAGE_SIZE).map((r) => ({ ...r, subject: r.subject?.id ? r.subject : null })),
      page,
      hasMore: rows.length > PAGE_SIZE,
    };
  }

  /** Veri dökümü (FR-07): kişi hakkındaki yönetici işlemleri, eskiden yeniye */
  forSubject(userId: string, db: Db | Tx = this.db) {
    return db
      .select({ action: adminAuditLog.action, targetType: adminAuditLog.targetType, targetId: adminAuditLog.targetId, note: adminAuditLog.note, at: adminAuditLog.createdAt })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.subjectUserId, userId))
      .orderBy(asc(adminAuditLog.createdAt));
  }

  /** Hesap silinince (FR-07): kayıt hesap verebilirlik için kalır, kişisel bilgi içerebilecek serbest metin silinir */
  async anonymizeSubject(userId: string, tx: Tx): Promise<void> {
    await tx.update(adminAuditLog).set({ note: null }).where(sql`${adminAuditLog.subjectUserId} = ${userId} and ${adminAuditLog.note} is not null`);
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
