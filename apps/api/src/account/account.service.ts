import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ACCOUNT_DELETION, DELETED_USER_NAME, isQualifiedReporter, OPEN_JOB_STATUSES, VISIBLE_LOAD_STATUSES } from "@nakliye/shared";
import { and, asc, count, eq, exists, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuditService } from "../audit/audit.service.js";
import { AuthService, SUSPENDED_MESSAGE } from "../auth/auth.service.js";
import { trDateTime } from "../common/format.js";
import { deletedPhoneHmac } from "../common/hash.js";
import { DB, type Db, type Tx } from "../db/db.module.js";
import { DocumentsService } from "../documents/documents.service.js";
import {
  callLogs,
  capacityPosts,
  companies,
  devices,
  districts,
  documents,
  favoriteCarriers,
  jobEvents,
  mfaChallenges,
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
  totpRecoveryCodes,
  userRoles,
  users,
  userTotp,
  vehicles,
} from "../db/schema.js";
import { OffersService } from "../jobs/offers.service.js";
import { LoadsService } from "../loads/loads.service.js";
import { CapacityService } from "../vehicles/capacity.service.js";

/** Kapanabilir ilanlar: yayındakiler ve moderasyonda bekleyenler */
const CLOSABLE_LOADS = [...VISIBLE_LOAD_STATUSES, "moderasyonda" as const];
/** Silme isteği yarıda kalırsa (çökme) zamanlayıcı bu kadar sonra tamamlar; süren isteğin adımlarıyla çakışmasın */
const PENDING_DELETION_GRACE_MS = 5 * 60_000;
const DAY_MS = 24 * 3_600_000;

const od = alias(districts, "od");
const op = alias(provinces, "op");
const dd = alias(districts, "dd");
const dp = alias(provinces, "dp");
const otherU = alias(users, "other_u");
const otherC = alias(companies, "other_c");
const reporterU = alias(users, "reporter_u");

/**
 * Hesap ve kişisel veriler (FR-07, NFR-05, docs/04 §8): veri dökümü, hesap silme (anonimleştirme), hesap dondurma (FR-08)
 * ve askıya alma ile ortak "açık işleri kapat" adımı.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly auth: AuthService,
    private readonly loads: LoadsService,
    private readonly capacity: CapacityService,
    private readonly offers: OffersService,
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
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

  /** Yönetici hesabı ya da sonuçlanmamış taşıması olan hesap silinemez/dondurulamaz (karşı tarafın işi yarım kalmasın). */
  private async activityBlocker(userId: string, db: Db | Tx, action: "sil" | "dondur"): Promise<string | null> {
    const [admin] = await db.select({ n: count() }).from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, "admin")));
    if (admin && admin.n > 0) return action === "sil" ? "Yönetici hesabı silinemez." : "Yönetici hesabı dondurulamaz.";
    const [open] = await db
      .select({ n: count() })
      .from(jobs)
      .where(and(or(eq(jobs.shipperId, userId), eq(jobs.carrierId, userId)), inArray(jobs.status, [...OPEN_JOB_STATUSES])));
    if (open && open.n > 0) {
      return `Sonuçlanmamış ${open.n} taşımanız var. Hesabınızı ${action === "sil" ? "silmeden" : "dondurmadan"} önce tamamlanmalı ya da iptal edilmeli.`;
    }
    return null;
  }

  /**
   * Silmeyi engelleyen durum: `activityBlocker` ya da süresi dolmamış şikayet ertelemesi (`reportHold`). `startHold`: ilk
   * ertelenen istekte erteleme başlangıcı yazılır.
   */
  private async deletionBlocker(userId: string, now: Date, db: Db | Tx = this.db, startHold = false): Promise<string | null> {
    return (await this.activityBlocker(userId, db, "sil")) ?? this.reportHold(userId, now, db, startHold);
  }

  /**
   * Hesap ya da ilanları hakkında nitelikli açık şikayet silmeyi erteler: silip aynı numarayla dönerek incelemeden
   * kaçılmasın. Nitelikli şikayetçi BR-05'teki gibi (shared isQualifiedReporter): doğrulanmış ya da hedefle gerçek teması
   * olan — ilan şikayetinde o ilanı aramış; kullanıcı şikayetinde onun bir ilanını aramış ya da onunla taşıma yapmış.
   * Erteleme ilk ertelenen istekten en çok ACCOUNT_DELETION.reportHoldDays sürer; sonra şikayet açık olsa da silinir
   * (kayıt kalır, karar yöneticinin): herkesin açabildiği şikayetle silme süresiz engellenemez. Şikayetin kimden ve ne
   * olduğu söylenmez.
   */
  private async reportHold(userId: string, now: Date, db: Db | Tx, start: boolean): Promise<string | null> {
    const ownLoads = db.select({ id: loadPosts.id }).from(loadPosts).where(eq(loadPosts.shipperId, userId));
    const contact = sql<boolean>`case when ${reports.targetType} = 'load_post'
      then exists (select 1 from ${callLogs} c where c.caller_id = ${reports.reporterId} and c.load_post_id = ${reports.targetId})
      else exists (select 1 from ${callLogs} c join ${loadPosts} l on l.id = c.load_post_id where c.caller_id = ${reports.reporterId} and l.shipper_id = ${reports.targetId})
        or exists (select 1 from ${jobs} j where (j.shipper_id = ${reports.reporterId} and j.carrier_id = ${reports.targetId}) or (j.carrier_id = ${reports.reporterId} and j.shipper_id = ${reports.targetId}))
      end`;
    const open = await db
      .select({ level: reporterU.verificationLevel, contact })
      .from(reports)
      .innerJoin(reporterU, eq(reporterU.id, reports.reporterId))
      .where(
        and(
          eq(reports.status, "acik"),
          or(and(eq(reports.targetType, "user"), eq(reports.targetId, userId)), and(eq(reports.targetType, "load_post"), inArray(reports.targetId, ownLoads))),
        ),
      );
    if (!open.some((r) => isQualifiedReporter({ verificationLevel: r.level, calledThisLoad: r.contact }))) return null;

    // Eski istek (ör. aylar önce, başka bir şikayet için) yeni başvuruyu ertelemesiz yapmasın
    const [u] = await db.select({ since: users.deletionRequestedAt }).from(users).where(eq(users.id, userId));
    let since = u?.since && now.getTime() - u.since.getTime() < ACCOUNT_DELETION.holdRequestValidDays * DAY_MS ? u.since : null;
    if (!since) {
      since = now;
      if (start) await db.update(users).set({ deletionRequestedAt: now }).where(eq(users.id, userId));
    }
    const until = new Date(since.getTime() + ACCOUNT_DELETION.reportHoldDays * DAY_MS);
    if (now >= until) return null;
    return `Hesabınızla ilgili sonuçlanmamış bir inceleme var. İnceleme sonuçlanınca ya da en geç ${trDateTime(until)} itibarıyla hesabınızı silebilirsiniz.`;
  }

  private async phoneOf(userId: string): Promise<string> {
    const [u] = await this.db.select({ phone: users.phone, status: users.status }).from(users).where(eq(users.id, userId));
    if (!u?.phone || u.status === "silindi") throw new NotFoundException("Hesap bulunamadı");
    return u.phone;
  }

  /** Silme onay kodu hesabın kendi numarasına gider (giriş kodu gibi; tekrar istemek için 60 sn beklenir). */
  async requestDeletionCode(userId: string, ip: string | null = null, now = new Date()): Promise<void> {
    const blocker = await this.deletionBlocker(userId, now, this.db, true);
    if (blocker) throw new ConflictException(blocker);
    await this.auth.requestOtp(await this.phoneOf(userId), "silme", ip, now);
  }

  /**
   * Hesabı siler (FR-07); kodla yeniden doğrulanır. Kişisel alanlar anonimleştirilir, kayıt karşı tarafların iş ve puan
   * geçmişi için "Silinmiş kullanıcı" olarak kalır (docs/04 §8). Numara boşalır; anahtarlı özeti ACCOUNT_DELETION.restoreDays
   * saklanır: bu sürede aynı numarayla giriş hesabı puanları ve geçmişiyle geri açar (AuthService.verifyOtp), sonra yeni,
   * boş hesap açılır. Böylece kötü puanlar silip yeniden kaydolarak sıfırlanamaz.
   */
  async deleteAccount(userId: string, code: string, now = new Date()) {
    const phone = await this.phoneOf(userId);
    const blocker = await this.deletionBlocker(userId, now, this.db, true);
    if (blocker) throw new ConflictException(blocker);
    // Yanlış/süresi dolmuş onay kodu oturum hatası değildir: 401 dönseydi istemciler oturumu düşmüş sayıp girişe atardı
    await this.auth.consumeOtp(phone, code, "silme").catch((e: unknown) => {
      throw e instanceof UnauthorizedException ? new BadRequestException(e.message) : e;
    });

    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId)).for("update");
      // Kilitten önce askıya alınmış olabilir: silme askı kaydını siler, kişi aynı numarayla temiz hesap açardı
      if (locked?.status !== "aktif") throw new ConflictException(locked?.status === "askida" ? SUSPENDED_MESSAGE : "Hesap zaten silinmiş");
      // Bekleyen teklifler önce geri çekilir: aynı anda kabul edilen teklifte (kabul teklif satırını kilitler) ya kabul
      // önce biter ve iş aşağıdaki kontrolde görülür (silme 409, bu transaction geri alınır) ya da teklif artık beklemede değildir.
      await tx.update(offers).set({ status: "geri_cekildi" }).where(and(eq(offers.carrierId, userId), eq(offers.status, "beklemede")));
      const late = await this.deletionBlocker(userId, now, tx);
      if (late) throw new ConflictException(late);
      // Aynı numaranın daha eski (süresi dolmuş, henüz temizlenmemiş) bağı düşer: numara başına tek geri açılacak hesap
      const hmac = deletedPhoneHmac(phone);
      await tx.update(users).set({ phoneHmac: null }).where(and(eq(users.phoneHmac, hmac), ne(users.id, userId)));
      // Bu andan sonra giriş, belirteç yenileme ve erişim belirteci kapanır (AuthGuard durum kontrolü)
      await tx.update(users).set({ status: "silindi", deletedAt: now, phoneHmac: hmac, deletionRequestedAt: null }).where(eq(users.id, userId));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
    });
    // Hesap artık silinmiş sayılır (giriş kapalı): anonimleştirme burada yarıda kalırsa (ör. ilanın iyimser kilidi)
    // istemciye hata dönülmez, zamanlayıcı tamamlar (finishPendingDeletions)
    try {
      await this.finishDeletion(userId, now);
    } catch (e) {
      this.logger.error(`Hesap ${userId} anonimleştirmesi yarıda kaldı; zamanlayıcı tamamlayacak`, e instanceof Error ? e.stack : String(e));
    }
    return { deleted: true };
  }

  /** Silinmiş işaretli hesabın açık işlerini kapatır ve kişisel verilerini anonimleştirir (tekrar çalıştırılabilir). */
  private async finishDeletion(userId: string, now: Date) {
    await this.closeOpenActivity(userId, now);
    // Belge dosyaları (ruhsat, vergi levhası fotoğrafı) satırlardan önce: dosya silinemezse (hata) tur yeniden dener
    await this.documents.purge({ ownerUserId: userId });
    const lateFiles = await this.db.transaction(async (tx) => {
      const [u] = await tx.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).for("update");
      if (!u) return [];
      if (u.phone) await tx.delete(otpCodes).where(eq(otpCodes.phone, u.phone));
      // Seviye 0: belgeler ve firma silindi; geri açılan hesap (ya da numarayı devralan) belgesiz rozet almasın
      await tx.update(users).set({ phone: null, name: DELETED_USER_NAME, suspendedAt: null, suspendReason: null, verificationLevel: 0 }).where(eq(users.id, userId));
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      await tx.delete(companies).where(eq(companies.ownerUserId, userId));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
      await tx.delete(mfaChallenges).where(eq(mfaChallenges.userId, userId));
      // Yönetici işlem kaydı kalır (hesap verebilirlik), kişisel bilgi içerebilecek gerekçe metni silinir
      await this.audit.anonymizeSubject(userId, tx);
      await tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
      await tx.delete(userTotp).where(eq(userTotp.userId, userId));
      await tx.delete(devices).where(eq(devices.userId, userId));
      await tx.delete(notifications).where(eq(notifications.userId, userId));
      await tx.delete(routeAlerts).where(eq(routeAlerts.userId, userId));
      await tx.delete(favoriteCarriers).where(or(eq(favoriteCarriers.shipperId, userId), eq(favoriteCarriers.carrierId, userId)));
      // purge'dan sonra bir belge eklendiyse (yükleme aktif durumu kilit altında denetlediği için beklenmez) dosyası da gider
      const late = await tx.delete(documents).where(eq(documents.ownerUserId, userId)).returning({ fileKey: documents.fileKey });
      // Plaka kişiyi gösterebilir; araç kaydı karşı tarafın iş geçmişi için kalır
      await tx.update(vehicles).set({ status: "silindi", plate: "—" }).where(eq(vehicles.ownerUserId, userId));
      // Serbest metinler kişisel bilgi (ad, numara) içerebilir. Açık şikayetin notu yönetici kararı için kalır; şikayet
      // sonuçlanınca silinir (AdminService.resolveReport).
      await tx.update(loadPosts).set({ note: null }).where(eq(loadPosts.shipperId, userId));
      await tx.update(offers).set({ note: null }).where(eq(offers.carrierId, userId));
      await tx.update(ratings).set({ comment: null }).where(eq(ratings.raterId, userId));
      await tx.update(reports).set({ note: null }).where(and(eq(reports.reporterId, userId), ne(reports.status, "acik")));
      // Kullanıcının yazdığı iptal ve itiraz sebebi. Olayın sahibine göre süzülür: yönetici kararıyla iptalde
      // cancelled_by nakliyecidir ama metin yöneticinin ("Yönetici kararı: …") ve kalır.
      const ownCancels = tx.select({ jobId: jobEvents.jobId }).from(jobEvents).where(and(eq(jobEvents.actorId, userId), eq(jobEvents.type, "iptal")));
      await tx.update(jobs).set({ cancelReason: null }).where(inArray(jobs.id, ownCancels));
      await tx
        .update(jobEvents)
        .set({ meta: sql`${jobEvents.meta} - 'reason'` })
        .where(and(eq(jobEvents.actorId, userId), sql`${jobEvents.meta} ->> 'reason' is not null`));
      return late.map((d) => d.fileKey);
    });
    await this.documents.removeFiles(lateFiles);
  }

  /** Zamanlayıcı: geri açma süresi (ACCOUNT_DELETION.restoreDays) dolan silinmiş numara özetlerini siler. */
  async expireDeletedPhoneLinks(now = new Date()): Promise<number> {
    const rows = await this.db
      .update(users)
      .set({ phoneHmac: null })
      .where(and(isNotNull(users.phoneHmac), lt(users.deletedAt, new Date(now.getTime() - ACCOUNT_DELETION.restoreDays * DAY_MS))))
      .returning({ id: users.id });
    return rows.length;
  }

  /** Zamanlayıcı: silme isteği yarıda kalan (çöken) hesapları tamamlar. */
  async finishPendingDeletions(now = new Date()): Promise<number> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.status, "silindi"), isNotNull(users.phone), lt(users.deletedAt, new Date(now.getTime() - PENDING_DELETION_GRACE_MS))));
    let done = 0;
    // Bir hesaptaki hata (ör. iyimser kilit) diğerlerini bekletmesin; kalan bir sonraki turda yeniden denenir
    for (const r of rows) {
      try {
        await this.finishDeletion(r.id, now);
        done++;
      } catch (e) {
        this.logger.error(`Hesap ${r.id} anonimleştirmesi tamamlanamadı`, e instanceof Error ? e.stack : String(e));
      }
    }
    return done;
  }

  // ── Hesap dondurma (FR-08) ─────────────────────────────────────────

  /**
   * Hesabı dondurur (FR-08, 2026-10-13 kullanıcı isteği: Instagram'daki gibi ara vermek isteyen, sistemi meşgul etmek
   * istemeyen kullanıcı için). Veri silinmez: puanlar, geçmiş ve şikayetler kalır. Oturumlar kapanır; açık ilanlar ve boş
   * araç ilanları kapanır, bekleyen teklifler geri çekilir (askıya almayla ortak adım); bildirim yazılmaz. SMS koduyla giriş
   * hesabı açar (AuthService.verifyOtp); kapanan ilanlar açılmaz ("Benzerini yayınla"). Kod istenmez: işlem geri alınabilir
   * ve SMS ücreti doğmasın. Yönetici dondurulmuş hesabı da askıya alabilir (dondurma askıdan kaçış olmasın).
   */
  async freezeAccount(userId: string, now = new Date()) {
    const blocker = await this.activityBlocker(userId, this.db, "dondur");
    if (blocker) throw new ConflictException(blocker);
    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId)).for("update");
      if (locked?.status !== "aktif") throw new ConflictException(locked?.status === "askida" ? SUSPENDED_MESSAGE : "Hesap zaten dondurulmuş");
      // Silmedeki sıra: teklif kabulüyle yarışta ya iş önce oluşur (dondurma 409) ya da teklif artık beklemede değildir
      await tx.update(offers).set({ status: "geri_cekildi" }).where(and(eq(offers.carrierId, userId), eq(offers.status, "beklemede")));
      const late = await this.activityBlocker(userId, tx, "dondur");
      if (late) throw new ConflictException(late);
      // Bu andan sonra belirteç yenileme ve erişim belirteci kapanır (AuthGuard durum kontrolü)
      await tx.update(users).set({ status: "donduruldu" }).where(eq(users.id, userId));
      await tx.update(refreshTokens).set({ revokedAt: now }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    });
    // Hesap dondurulmuş sayılır; ilan kapatma yarıda kalırsa zamanlayıcı tamamlar (closeFrozenLeftovers)
    try {
      await this.closeOpenActivity(userId, now);
    } catch (e) {
      this.logger.error(`Dondurulan hesap ${userId} için ilanlar kapatılamadı; zamanlayıcı tamamlayacak`, e instanceof Error ? e.stack : String(e));
    }
    return { frozen: true };
  }

  /** Zamanlayıcı: dondurulmuş hesapta kapanamamış (yarıda kalan) ilan, boş araç ilanı ya da bekleyen teklif kalmasın. */
  async closeFrozenLeftovers(now = new Date()): Promise<number> {
    const db = this.db;
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.status, "donduruldu"),
          or(
            exists(db.select({ x: sql`1` }).from(loadPosts).where(and(eq(loadPosts.shipperId, users.id), inArray(loadPosts.status, CLOSABLE_LOADS)))),
            exists(db.select({ x: sql`1` }).from(capacityPosts).where(and(eq(capacityPosts.carrierId, users.id), eq(capacityPosts.status, "aktif")))),
            exists(db.select({ x: sql`1` }).from(offers).where(and(eq(offers.carrierId, users.id), eq(offers.status, "beklemede")))),
          ),
        ),
      )
      .limit(100);
    let done = 0;
    for (const r of rows) {
      try {
        // Seçimden bu yana girişle açılıp yeni ilan vermiş olabilir: açık hesabın ilanı kapatılmaz
        const [u] = await db.select({ status: users.status }).from(users).where(eq(users.id, r.id));
        if (u?.status !== "donduruldu") continue;
        await this.closeOpenActivity(r.id, now);
        done++;
      } catch (e) {
        this.logger.error(`Dondurulan hesap ${r.id} için ilanlar kapatılamadı`, e instanceof Error ? e.stack : String(e));
      }
    }
    return done;
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
      note: "Hesabınıza ait kişisel veriler (KVKK md. 11). Karşı tarafların telefon numaraları, giriş kodları ve şifreli özetler dahil değildir. Henüz görünür olmayan (kör) puanlar dahil edilmez. Hakkınızdaki yönetici işlemleri (belge açma, kararlar) adminActions'ta.",
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
      // NFR-05: hakkınızdaki yönetici işlemleri (belge açma, kararlar, askı); işlemi yapan yöneticinin kimliği dahil değil
      adminActions: await this.audit.forSubject(userId),
    };
  }
}
