import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  DOCUMENT_EXTENSIONS,
  DOCUMENT_LIMITS,
  DOCUMENT_RULES,
  DOCUMENT_TYPES,
  detectDocumentType,
  trDay,
  type AdminDocumentListInput,
  type DocumentType,
  type ReviewDocumentInput,
  type UploadDocumentInput,
} from "@nakliye/shared";
import { and, asc, count, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";
import type { AccessPayload } from "../auth/auth.service.js";
import { DB, type Db, type Tx } from "../db/db.module.js";
import { companies, documents, userRoles, users, vehicles } from "../db/schema.js";
import { FILE_STORAGE, type FileStorage } from "../files/file-storage.js";
import { signFileUrl } from "../files/signed-url.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { TrustService } from "../ratings/trust.service.js";

const PAGE_SIZE = 20;
const owner = alias(users, "owner");

/** Multer'ın bellek deposundan gelen dosya (yalnız kullanılan alanlar) */
export interface UploadedDocumentFile {
  buffer: Buffer;
  size: number;
}

/** Aynı sahip, tür ve (araca bağlı türde) araç: "aynı belge" */
const sameDocument = (ownerId: string, type: DocumentType, vehicleId: string | null) =>
  and(eq(documents.ownerUserId, ownerId), eq(documents.type, type), vehicleId ? eq(documents.vehicleId, vehicleId) : isNull(documents.vehicleId));

const label = (type: DocumentType, plate: string | null) => `${DOCUMENT_TYPES[type]}${plate ? ` (${plate})` : ""}`;

/**
 * Belgeler (FR-05, FR-50, BR-10; docs/04 §8). Dosya özel depoda (FileStorage), yalnız sahibi ve yönetici 5 dk'lık imzalı
 * bağlantıyla açar. Yönetici onaylayınca doğrulama seviyesi yeniden hesaplanır (TrustService.recompute); vergi levhası
 * onayı firmayı doğrulanmış yapar (companies.verified_at).
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly trust: TrustService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Yükleme. Aynı belge için incelemede bekleyen varsa yenisi onun yerine geçer (eski dosya silinir); onaylı olan varsa
   * yenisi incelemeye girer, eskisi yenisi onaylanana kadar geçerli kalır (yenileme: süresi dolacak sigorta vb.).
   */
  async upload(userId: string, input: UploadDocumentInput, file: UploadedDocumentFile | undefined, now = new Date()) {
    if (!file || file.size === 0) throw new BadRequestException("Dosya seçin");
    // Tür beyan edilene ya da dosya adına değil ilk baytlara göre: HTML/SVG gibi betik taşıyabilen dosya kabul edilmez
    const contentType = detectDocumentType(file.buffer.subarray(0, 16));
    if (!contentType) throw new HttpException("Yalnız PDF, JPEG ya da PNG yükleyebilirsiniz", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    const rule = DOCUMENT_RULES[input.type];
    const roles = (await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role);
    if (!roles.includes(rule.role)) {
      throw new ForbiddenException(`${DOCUMENT_TYPES[input.type]} ${rule.role === "carrier" ? "nakliyeci" : "yük sahibi"} hesabıyla yüklenir`);
    }
    let vehicleId: string | null = null;
    if (rule.perVehicle) {
      if (!input.vehicleId) throw new BadRequestException(`${DOCUMENT_TYPES[input.type]} hangi aracın? Aracı seçin`);
      const [v] = await this.db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.ownerUserId, userId), eq(vehicles.status, "aktif")));
      if (!v) throw new NotFoundException("Araç bulunamadı");
      vehicleId = v.id;
    } else if (input.vehicleId) {
      throw new BadRequestException(`${DOCUMENT_TYPES[input.type]} araca bağlı değil`);
    }
    let company: { title: string; taxNo: string | null } | null = null;
    if (input.type === "vergi_levhasi") {
      [company = null] = await this.db.select({ title: companies.title, taxNo: companies.taxNo }).from(companies).where(eq(companies.ownerUserId, userId));
      if (!company) throw new ConflictException("Önce firma bilgilerinizi girin");
    }

    const id = randomUUID();
    const key = `documents/${userId}/${id}.${DOCUMENT_EXTENSIONS[contentType]}`;
    await this.storage.put(key, file.buffer);
    let replacedKey: string | null = null;
    try {
      await this.db.transaction(async (tx) => {
        // Kullanıcı satırı kilidi: aynı anda iki yükleme günlük sınırı aşmasın, aynı belge için iki bekleyen açılmasın.
        // Durum kilit altında yeniden: silme/dondurma ile yarışta silinen hesaba belge (sahipsiz dosya) kalmasın.
        const [u] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId)).for("update");
        if (u?.status !== "aktif") throw new ConflictException("Hesabınız aktif değil");
        // Araç silmeyle yarış: araç kilitli (araç silme FOR UPDATE alır) ve hâlâ etkin olmalı
        if (vehicleId) {
          const [v] = await tx.select({ id: vehicles.id }).from(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.status, "aktif"))).for("share");
          if (!v) throw new NotFoundException("Araç bulunamadı");
        }
        const [{ n }] = (await tx
          .select({ n: count() })
          .from(documents)
          .where(and(eq(documents.ownerUserId, userId), gte(documents.createdAt, new Date(now.getTime() - 24 * 3_600_000))))) as [{ n: number }];
        if (n >= DOCUMENT_LIMITS.uploadsPerDay) throw new HttpException("Bugün çok belge yüklediniz; yarın tekrar deneyin", HttpStatus.TOO_MANY_REQUESTS);
        const [pending] = await tx
          .select({ id: documents.id, fileKey: documents.fileKey })
          .from(documents)
          .where(and(sameDocument(userId, input.type, vehicleId), eq(documents.status, "bekliyor")));
        if (pending) {
          replacedKey = pending.fileKey;
          await tx.delete(documents).where(eq(documents.id, pending.id));
        }
        await tx.insert(documents).values({
          id,
          ownerUserId: userId,
          vehicleId,
          type: input.type,
          fileKey: key,
          contentType,
          sizeBytes: file.size,
          companyTitle: company?.title ?? null,
          companyTaxNo: company?.taxNo ?? null,
          createdAt: now,
        });
      });
    } catch (e) {
      await this.storage.delete(key).catch(() => {});
      throw e;
    }
    if (replacedKey) await this.removeFile(replacedKey);
    return (await this.list(userId)).items.find((d) => d.id === id)!;
  }

  /** Kendi belgeleri, yeniden eskiye (araç plakasıyla) */
  async list(userId: string) {
    const rows = await this.db
      .select({
        id: documents.id,
        type: documents.type,
        vehicleId: documents.vehicleId,
        plate: vehicles.plate,
        status: documents.status,
        rejectReason: documents.rejectReason,
        expiresAt: documents.expiresAt,
        contentType: documents.contentType,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
        reviewedAt: documents.reviewedAt,
      })
      .from(documents)
      .leftJoin(vehicles, eq(vehicles.id, documents.vehicleId))
      .where(eq(documents.ownerUserId, userId))
      .orderBy(desc(documents.createdAt));
    return { items: rows };
  }

  /** 5 dk'lık imzalı dosya yolu (API kökünden): yalnız sahibi ve yönetici. Yöneticinin başkasının belgesini açması loglanır. */
  async url(user: AccessPayload, id: string, now = Date.now()) {
    const [d] = await this.db.select({ ownerUserId: documents.ownerUserId, fileKey: documents.fileKey }).from(documents).where(eq(documents.id, id));
    const isAdmin = user.roles.includes("admin");
    if (!d || (d.ownerUserId !== user.sub && !isAdmin)) throw new NotFoundException("Belge bulunamadı");
    if (d.ownerUserId !== user.sub) this.logger.log(`Yönetici ${user.sub} belge ${id} dosyasını açtı`);
    return signFileUrl(d.fileKey, now);
  }

  // ── Yönetici (Y1, FR-50) ───────────────────────────────────────────

  /** Bekleyenler eskiden yeniye (önce bekleyen ilk); sonuçlananlar karar tarihine göre yeniden eskiye. */
  async adminList({ status, page }: AdminDocumentListInput) {
    const rows = await this.db
      .select({
        id: documents.id,
        type: documents.type,
        status: documents.status,
        contentType: documents.contentType,
        sizeBytes: documents.sizeBytes,
        rejectReason: documents.rejectReason,
        expiresAt: documents.expiresAt,
        createdAt: documents.createdAt,
        reviewedAt: documents.reviewedAt,
        owner: { id: owner.id, name: owner.name, phone: owner.phone, status: owner.status },
        company: { title: companies.title, taxNo: companies.taxNo, taxOffice: companies.taxOffice, verifiedAt: companies.verifiedAt },
        uploadedAs: { title: documents.companyTitle, taxNo: documents.companyTaxNo },
        vehicle: { id: vehicles.id, plate: vehicles.plate, vehicleType: vehicles.vehicleType },
      })
      .from(documents)
      .innerJoin(owner, eq(owner.id, documents.ownerUserId))
      .leftJoin(companies, eq(companies.ownerUserId, documents.ownerUserId))
      .leftJoin(vehicles, eq(vehicles.id, documents.vehicleId))
      .where(eq(documents.status, status))
      .orderBy(status === "bekliyor" ? asc(documents.createdAt) : sql`${documents.reviewedAt} desc nulls last`)
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    return {
      items: rows.slice(0, PAGE_SIZE).map((r) => {
        const uploadedAs = r.uploadedAs?.title ? r.uploadedAs : null;
        const company = r.company?.title ? r.company : null;
        return {
          ...r,
          company,
          uploadedAs,
          // Vergi levhası yüklendikten sonra firma kimliği değişti: onay 409 döner, belge reddedilmeli
          companyChanged: !!uploadedAs && (!company || company.title !== uploadedAs.title || company.taxNo !== uploadedAs.taxNo),
          vehicle: r.vehicle?.id ? r.vehicle : null,
        };
      }),
      page,
      hasMore: rows.length > PAGE_SIZE,
    };
  }

  /**
   * Yönetici kararı. Onayda aynı belgenin eski kayıtları (önceki onaylı/ret) ve dosyaları silinir (veri en aza indirme);
   * vergi levhası onayı firmayı doğrulanmış yapar. Seviye yeniden hesaplanır, sahibine bildirim gider.
   */
  async review(adminId: string, id: string, input: ReviewDocumentInput, now = new Date()) {
    if (input.decision === "onay" && input.expiresAt && input.expiresAt < trDay(now)) throw new BadRequestException("Geçerlilik sonu geçmiş bir gün olamaz");
    const decided = await this.db.transaction(async (tx) => {
      const [d] = await tx
        .update(documents)
        .set(
          input.decision === "onay"
            ? { status: "onay", expiresAt: input.expiresAt ?? null, rejectReason: null, reviewedBy: adminId, reviewedAt: now }
            : { status: "ret", rejectReason: input.rejectReason, reviewedBy: adminId, reviewedAt: now },
        )
        .where(and(eq(documents.id, id), eq(documents.status, "bekliyor")))
        .returning();
      if (!d) {
        const [exists] = await tx.select({ id: documents.id }).from(documents).where(eq(documents.id, id));
        if (!exists) throw new NotFoundException("Belge bulunamadı");
        throw new ConflictException("Belge zaten incelenmiş");
      }
      let oldKeys: string[] = [];
      if (d.status === "onay") {
        if (d.type === "vergi_levhasi") {
          // Yalnız levhanın yüklendiği kimlikteki firma doğrulanır; kimlik değiştiyse onay geri alınır (transaction)
          const verified = await tx
            .update(companies)
            .set({ verifiedAt: now })
            .where(
              and(
                eq(companies.ownerUserId, d.ownerUserId),
                eq(companies.title, d.companyTitle ?? ""),
                d.companyTaxNo === null ? isNull(companies.taxNo) : eq(companies.taxNo, d.companyTaxNo),
              ),
            )
            .returning({ id: companies.id });
          if (verified.length === 0) throw new ConflictException("Firma unvanı ya da vergi numarası belge yüklendikten sonra değişti; belgeyi reddedin, kullanıcı güncel levhayı yüklesin");
        }
        const old = await tx
          .delete(documents)
          .where(and(sameDocument(d.ownerUserId, d.type, d.vehicleId), ne(documents.id, d.id), ne(documents.status, "bekliyor")))
          .returning({ fileKey: documents.fileKey });
        oldKeys = old.map((o) => o.fileKey);
      }
      return { doc: d, oldKeys };
    });
    for (const k of decided.oldKeys) await this.removeFile(k);
    const d = decided.doc;
    await this.trust.refresh(d.ownerUserId);
    const [v] = d.vehicleId ? await this.db.select({ plate: vehicles.plate }).from(vehicles).where(eq(vehicles.id, d.vehicleId)) : [];
    const name = label(d.type, v?.plate ?? null);
    await this.notifications
      .notify(d.ownerUserId, {
        type: "document_review",
        title: d.status === "onay" ? "Belgeniz onaylandı" : "Belgeniz reddedildi",
        body: (d.status === "onay" ? `${name} onaylandı.` : `${name} reddedildi: ${d.rejectReason}. Düzeltip yeniden yükleyebilirsiniz.`).slice(0, 500),
        data: { type: "document", documentId: d.id },
      })
      .catch((e: Error) => this.logger.warn(`Belge bildirimi yazılamadı (${d.id}): ${e.message}`));
    return { id: d.id, status: d.status };
  }

  // ── Zamanlayıcı ve silme ──────────────────────────────────────────

  /** Geçerlilik sonu geçen onaylı belge: seviye yenilenir, sahibine bir kez bildirilir. */
  async processExpired(now = new Date()): Promise<number> {
    const rows = await this.db
      .update(documents)
      .set({ expiryHandledAt: now })
      .where(and(eq(documents.status, "onay"), isNull(documents.expiryHandledAt), lt(documents.expiresAt, trDay(now))))
      .returning({ id: documents.id, ownerUserId: documents.ownerUserId, type: documents.type, vehicleId: documents.vehicleId });
    for (const r of rows) {
      await this.trust.refresh(r.ownerUserId);
      const [v] = r.vehicleId ? await this.db.select({ plate: vehicles.plate }).from(vehicles).where(eq(vehicles.id, r.vehicleId)) : [];
      await this.notifications
        .notify(r.ownerUserId, {
          type: "document_review",
          title: "Belgenizin süresi doldu",
          body: `${label(r.type, v?.plate ?? null)} geçerlilik süresi doldu; yenisini yükleyin.`,
          data: { type: "document", documentId: r.id },
          refKey: `doc-expired:${r.id}`,
        })
        .catch((e: Error) => this.logger.warn(`Süre bildirimi yazılamadı (${r.id}): ${e.message}`));
    }
    return rows.length;
  }

  /**
   * Belgelerin dosyalarını ve satırlarını siler (hesap silme, araç silme). Önce dosyalar: satır silinip dosya kalırsa
   * kişisel veri sahipsiz kalırdı; dosya silinip satır kalırsa (hata) bir sonraki deneme satırı da siler.
   */
  async purge(where: { ownerUserId: string; vehicleId?: string }, db: Db | Tx = this.db) {
    const cond = where.vehicleId
      ? and(eq(documents.ownerUserId, where.ownerUserId), eq(documents.vehicleId, where.vehicleId))
      : eq(documents.ownerUserId, where.ownerUserId);
    const rows = await db.select({ fileKey: documents.fileKey }).from(documents).where(cond);
    for (const r of rows) await this.storage.delete(r.fileKey);
    await db.delete(documents).where(cond);
    return rows.length;
  }

  /** Araç silindi (VehiclesService.remove): araca bağlı belgeler (ruhsat, sigorta) amaçsız kaldı, silinir; seviye yenilenir. */
  async vehicleRemoved(ownerUserId: string, vehicleId: string) {
    await this.purge({ ownerUserId, vehicleId });
    await this.trust.refresh(ownerUserId);
  }

  /** Satırı başka yerde (transaction'da) silinmiş belgelerin dosyaları: commit'ten sonra çağrılır */
  async removeFiles(keys: string[]) {
    for (const k of keys) await this.removeFile(k);
  }

  private async removeFile(key: string) {
    await this.storage.delete(key).catch((e: Error) => this.logger.error(`Belge dosyası silinemedi (${key}): ${e.message}`));
  }
}
