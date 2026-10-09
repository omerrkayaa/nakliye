import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  ACTIVE_JOB_STATUSES,
  canJobTransition,
  deliveryCodeSmsText,
  isVerifiedBadge,
  JOB_PARAMS,
  JOB_STATUS_LABELS,
  VISIBLE_LOAD_STATUSES,
  type JobStatus,
  type JobListInput,
} from "@nakliye/shared";
import { and, asc, desc, eq, gte, inArray, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";
import { sha256, sixDigitCode } from "../common/hash.js";
import { SmsService } from "../common/sms.service.js";
import { DB, type Db, type Tx } from "../db/db.module.js";
import { capacityPosts, companies, districts, jobEvents, jobs, loadPosts, offers, provinces, users, vehicles } from "../db/schema.js";
import { LoadsService } from "../loads/loads.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { RatingsService } from "../ratings/ratings.service.js";
import { TrustService } from "../ratings/trust.service.js";
import { OffersService } from "./offers.service.js";
import { vehicleBusy, vehicleBusyMessage } from "./vehicle-busy.js";

const PAGE_SIZE = 20;
const HOUR = 3_600_000;
type JobRow = typeof jobs.$inferSelect;
type Actor = "carrier" | "shipper" | "system";

const od = alias(districts, "od");
const op = alias(provinces, "op");
const dd = alias(districts, "dd");
const dp = alias(provinces, "dp");
const shipperU = alias(users, "su");
const carrierU = alias(users, "cu");
const shipperC = alias(companies, "sc");
const carrierC = alias(companies, "cc");

/** Teslim kodu hash'i: iş kimliğine bağlı, OTP biberiyle (kod DB'de düz saklanmaz; docs/04 §8). */
const codeHash = (jobId: string, code: string) => sha256(`delivery:${jobId}:${code}:${process.env.OTP_PEPPER ?? ""}`);

/** İş (taşıma): teklif kabulüyle doğar (FR-31/32), teslim kodu (F3), BR-31/32. */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly loads: LoadsService,
    private readonly offersService: OffersService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
    private readonly trust: TrustService,
    private readonly ratings: RatingsService,
  ) {}

  /**
   * Teklifi kabul et (UC-09): teklif kabul, diğer bekleyenler ret, ilan kapanır, iş oluşur, araç o tarihlerde dolu sayılır.
   * Hepsi tek transaction'da; ilan ve teklif satırları kilitlenir (iki teklif aynı anda kabul edilemez).
   * Teslim kodu yalnız bu yanıtta döner ve yük sahibine SMS'le gider (DB'de hash).
   */
  async accept(userId: string, offerId: string, now = new Date()) {
    const jobId = randomUUID();
    const code = sixDigitCode();

    const [target] = await this.db.select({ loadId: offers.loadPostId }).from(offers).where(eq(offers.id, offerId));
    if (!target) throw new NotFoundException("Teklif bulunamadı");

    const result = await this.db.transaction(async (tx) => {
      // Kilit sırası her zaman önce ilan, sonra teklif. Ters sırada (önce teklif) aynı ilanın iki teklifi aynı anda
      // kabul edilince deadlock oluşuyordu: A kendi teklifini + ilanı tutup B'nin teklifini reddetmeye çalışırken
      // B kendi teklifini tutup ilanı bekliyordu (testte yakalandı, 40P01 → 500).
      const [load] = await tx.select().from(loadPosts).where(eq(loadPosts.id, target.loadId)).for("update");
      if (!load || load.shipperId !== userId) throw new NotFoundException("Teklif bulunamadı");
      const [offer] = await tx.select().from(offers).where(eq(offers.id, offerId)).for("update");
      if (!offer) throw new NotFoundException("Teklif bulunamadı");
      if (offer.status !== "beklemede") throw new ConflictException("Teklif artık beklemede değil");
      if (!VISIBLE_LOAD_STATUSES.includes(load.status)) throw new ConflictException("İlan yayında değil; teklif kabul edilemez");
      // Araç satırı kilitlenir (kilit sırası: ilan → teklif → araç): aynı aracın iki ilandaki teklifi aynı anda
      // kabul edilirse ikincisi birincinin işini görür ve reddedilir (çifte rezervasyon olmaz)
      const [vehicle] = await tx
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.id, offer.vehicleId), eq(vehicles.status, "aktif")))
        .for("update");
      if (!vehicle) throw new ConflictException("Teklifteki araç artık kullanılmıyor");
      const busy = await vehicleBusy(tx, vehicle.id, load.loadFrom, load.loadTo);
      if (busy) throw new ConflictException(`${vehicleBusyMessage(busy)}; bu teklif kabul edilemez`);

      await tx.update(offers).set({ status: "kabul" }).where(eq(offers.id, offer.id));
      const rejected = await tx
        .update(offers)
        .set({ status: "ret" })
        .where(and(eq(offers.loadPostId, load.id), eq(offers.status, "beklemede")))
        .returning({ id: offers.id, carrierId: offers.carrierId });
      await this.loads.closeForJob(tx, load, now);
      await tx.insert(jobs).values({
        id: jobId,
        loadPostId: load.id,
        offerId: offer.id,
        shipperId: load.shipperId,
        carrierId: offer.carrierId,
        vehicleId: offer.vehicleId,
        agreedPrice: offer.price,
        deliveryCodeHash: codeHash(jobId, code),
        createdAt: now,
      });
      await this.event(tx, jobId, "olusturuldu", userId, { offerId: offer.id, price: offer.price });
      // Araç bu tarihlerde artık dolu: çakışan boş araç ilanları kapanır (yoksa eşleşmeye devam ederdi)
      await tx
        .update(capacityPosts)
        .set({ status: "kapandi" })
        .where(
          and(
            eq(capacityPosts.vehicleId, offer.vehicleId),
            eq(capacityPosts.status, "aktif"),
            lte(capacityPosts.availableFrom, load.loadTo),
            gte(capacityPosts.availableTo, load.loadFrom),
          ),
        );
      return { carrierId: offer.carrierId, vehicleId: offer.vehicleId, load, rejected };
    });

    // Yan etkiler commit'ten sonra (toplam iş sayısı iptal oranının paydası)
    await this.trust.refresh(userId, result.carrierId);
    const route = await this.offersService.route(result.load.id);
    const [shipper] = await this.db.select({ phone: users.phone }).from(users).where(eq(users.id, userId));
    await this.sms.send(shipper!.phone, deliveryCodeSmsText(code)).catch((e: Error) => this.logger.warn(`Teslim kodu SMS'i gitmedi (${jobId}): ${e.message}`));
    await this.notifications.notify(result.carrierId, {
      type: "offer_result",
      title: "Teklifiniz kabul edildi",
      body: `${route}: iş oluştu, yük sahibinin numarası iş detayında`,
      data: { type: "job", jobId },
    });
    for (const r of result.rejected) {
      await this.notifications.notify(r.carrierId, {
        type: "offer_result",
        refKey: `offer:${r.id}:sonuc`,
        title: "Teklifiniz sonuçlanmadı",
        body: `${route} ilanı için başka bir teklif kabul edildi`,
        data: { type: "offer", loadId: result.load.id, offerId: r.id },
      });
    }
    await this.offersService
      .withdrawBusy(result.vehicleId, result.load)
      .catch((e: Error) => this.logger.warn(`Aracın diğer teklifleri geri çekilemedi (${jobId}): ${e.message}`));
    return { job: await this.get(userId, jobId), deliveryCode: code };
  }

  async list(userId: string, q: JobListInput) {
    const scope = q.scope === "active" ? inArray(jobs.status, [...ACTIVE_JOB_STATUSES]) : notInArray(jobs.status, [...ACTIVE_JOB_STATUSES]);
    const rows = await this.selectJobs()
      .where(and(or(eq(jobs.shipperId, userId), eq(jobs.carrierId, userId)), scope))
      .orderBy(desc(jobs.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset((q.page - 1) * PAGE_SIZE);
    return { items: rows.slice(0, PAGE_SIZE).map((r) => this.view(r, userId)), page: q.page, hasMore: rows.length > PAGE_SIZE };
  }

  async get(userId: string, jobId: string) {
    const [row] = await this.selectJobs().where(eq(jobs.id, jobId));
    if (!row || (row.job.shipperId !== userId && row.job.carrierId !== userId)) throw new NotFoundException("İş bulunamadı");
    const events = await this.db
      .select({ type: jobEvents.type, actorId: jobEvents.actorId, meta: jobEvents.meta, at: jobEvents.createdAt })
      .from(jobEvents)
      .where(eq(jobEvents.jobId, jobId))
      .orderBy(asc(jobEvents.createdAt));
    return {
      ...this.view(row, userId),
      rating: await this.ratings.forJob(userId, row.job),
      events: events.map((e) => ({
        type: e.type,
        at: e.at,
        by: e.actorId === null ? "system" : e.actorId === row.job.shipperId ? "shipper" : "carrier",
        meta: e.meta,
      })),
    };
  }

  /** Nakliyeci: yüklendi / yolda (FR-33). */
  async setStatus(userId: string, jobId: string, to: "yuklendi" | "yolda") {
    const job = await this.party(userId, jobId, "carrier");
    await this.db.transaction((tx) => this.transition(tx, job, to, userId, "carrier", {}));
    await this.tell(job, "shipper", `Yükünüz: ${JOB_STATUS_LABELS[to]}`);
    return this.get(userId, jobId);
  }

  /** Teslim (F3, UC-10): nakliyeci alıcıdan aldığı 6 haneli kodu girer. Yanlış denemeler sınırlı. */
  async deliver(userId: string, jobId: string, code: string, now = new Date()) {
    const job = await this.party(userId, jobId, "carrier");
    if (!canJobTransition(job.status, "teslim_edildi", "carrier")) throw this.statusConflict(job.status);
    if (job.deliveryCodeAttempts >= JOB_PARAMS.deliveryCodeMaxAttempts) throw this.codeLocked();

    if (codeHash(job.id, code) !== job.deliveryCodeHash) {
      // Sayaç atomik artar: aynı anda gelen denemeler sınırı aşamaz
      const [r] = await this.db
        .update(jobs)
        .set({ deliveryCodeAttempts: sql`${jobs.deliveryCodeAttempts} + 1` })
        .where(and(eq(jobs.id, job.id), lt(jobs.deliveryCodeAttempts, JOB_PARAMS.deliveryCodeMaxAttempts)))
        .returning({ attempts: jobs.deliveryCodeAttempts });
      await this.event(this.db, job.id, "hatali_kod", userId, {});
      if (!r) throw this.codeLocked();
      const left = JOB_PARAMS.deliveryCodeMaxAttempts - r.attempts;
      if (left === 0) {
        await this.tell(job, "shipper", "Teslim kodu çok kez yanlış girildi; uygulamadan yeni kod oluşturun");
        throw this.codeLocked();
      }
      throw new BadRequestException(`Teslim kodu hatalı (kalan deneme: ${left})`);
    }

    await this.db.transaction((tx) => this.transition(tx, job, "teslim_edildi", userId, "carrier", { deliveredAt: now }));
    await this.tell(job, "shipper", `Yükünüz teslim edildi. Sorun varsa ${JOB_PARAMS.autoCompleteH} saat içinde itiraz edin; yoksa iş tamamlanır.`);
    return this.get(userId, jobId);
  }

  /** Yük sahibi yeni teslim kodu üretir (kaybolduysa ya da deneme sınırı dolduysa); eski kod geçersizleşir. */
  async newDeliveryCode(userId: string, jobId: string) {
    const job = await this.party(userId, jobId, "shipper");
    if (!canJobTransition(job.status, "teslim_edildi", "carrier")) throw this.statusConflict(job.status);
    const code = sixDigitCode();
    await this.db
      .update(jobs)
      .set({ deliveryCodeHash: codeHash(job.id, code), deliveryCodeAttempts: 0 })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, job.status)));
    await this.event(this.db, job.id, "yeni_kod", userId, {});
    const [shipper] = await this.db.select({ phone: users.phone }).from(users).where(eq(users.id, userId));
    await this.sms.send(shipper!.phone, deliveryCodeSmsText(code)).catch((e: Error) => this.logger.warn(`Teslim kodu SMS'i gitmedi (${jobId}): ${e.message}`));
    return { deliveryCode: code };
  }

  /** Yük sahibi elle tamamlar (BR-31: kod girilemediyse ya da teslimi onaylıyorsa). */
  async complete(userId: string, jobId: string, now = new Date()) {
    const job = await this.party(userId, jobId, "shipper");
    await this.db.transaction((tx) => this.transition(tx, job, "tamamlandi", userId, "shipper", { completedAt: now }));
    await this.trust.refresh(job.shipperId, job.carrierId);
    await this.tell(job, "carrier", "İş tamamlandı. Yük sahibini puanlayabilirsiniz.");
    return this.get(userId, jobId);
  }

  /** İtiraz: teslimden sonra 48 saat içinde, yük sahibi (BR-32). Yönetici çözer (Faz 3). */
  async dispute(userId: string, jobId: string, reason: string, now = new Date()) {
    const job = await this.party(userId, jobId, "shipper");
    if (job.status === "teslim_edildi" && job.deliveredAt && now.getTime() - job.deliveredAt.getTime() > JOB_PARAMS.autoCompleteH * HOUR) {
      throw new ConflictException("İtiraz süresi doldu");
    }
    await this.db.transaction((tx) => this.transition(tx, job, "itirazli", userId, "shipper", {}, { reason }));
    await this.tell(job, "carrier", "Yük sahibi teslime itiraz etti; yönetici inceleyecek");
    return this.get(userId, jobId);
  }

  /** İptal: teslimden önce iki taraf, sebep zorunlu (iptal oranına yazılır, BR-30). */
  async cancel(userId: string, jobId: string, reason: string) {
    const job = await this.party(userId, jobId);
    const actor: Actor = job.shipperId === userId ? "shipper" : "carrier";
    await this.db.transaction((tx) => this.transition(tx, job, "iptal", userId, actor, { cancelReason: reason, cancelledBy: userId }, { reason }));
    await this.trust.refresh(job.shipperId, job.carrierId);
    await this.tell(job, actor === "shipper" ? "carrier" : "shipper", `İş iptal edildi: ${reason}`);
    return this.get(userId, jobId);
  }

  /** Zamanlayıcı (BR-32): teslimden 48 saat sonra itiraz yoksa tamamlandı. */
  async autoComplete(now = new Date()): Promise<number> {
    const due = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "teslim_edildi"), lte(jobs.deliveredAt, new Date(now.getTime() - JOB_PARAMS.autoCompleteH * HOUR))))
      .limit(500);
    let done = 0;
    for (const job of due) {
      try {
        await this.db.transaction((tx) => this.transition(tx, job, "tamamlandi", null, "system", { completedAt: now }));
      } catch (e) {
        if (e instanceof ConflictException) continue; // bu arada itiraz edildi / elle tamamlandı
        throw e;
      }
      done++;
      await this.trust.refresh(job.shipperId, job.carrierId);
      await this.tell(job, "shipper", "İş otomatik tamamlandı. Nakliyeciyi puanlayabilirsiniz.");
      await this.tell(job, "carrier", "İş tamamlandı. Yük sahibini puanlayabilirsiniz.");
    }
    return done;
  }

  // ── Yardımcılar ────────────────────────────────────────────────────

  /** İşin tarafı mı (ve istenen rolde mi)? Taraf değilse 404 (varlığını sızdırmamak için), rol yanlışsa 403. */
  private async party(userId: string, jobId: string, as?: "shipper" | "carrier"): Promise<JobRow> {
    const [job] = await this.db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job || (job.shipperId !== userId && job.carrierId !== userId)) throw new NotFoundException("İş bulunamadı");
    if (as === "shipper" && job.shipperId !== userId) throw new ForbiddenException("Bu işlemi yük sahibi yapar");
    if (as === "carrier" && job.carrierId !== userId) throw new ForbiddenException("Bu işlemi nakliyeci yapar");
    return job;
  }

  /** Durum geçişi: kurala uygun mu (kim yapıyor dahil) + iyimser kilit (durum okuduğumuz gibi mi) + olay kaydı. */
  private async transition(
    tx: Tx,
    job: JobRow,
    to: JobStatus,
    actorId: string | null,
    actor: Actor,
    set: Partial<typeof jobs.$inferInsert>,
    meta: Record<string, unknown> = {},
  ) {
    if (!canJobTransition(job.status, to, actor)) throw this.statusConflict(job.status);
    const updated = await tx
      .update(jobs)
      .set({ ...set, status: to })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, job.status)))
      .returning({ id: jobs.id });
    if (updated.length === 0) throw new ConflictException("İşin durumu az önce değişti; yenileyip tekrar deneyin");
    await this.event(tx, job.id, to, actorId, meta);
  }

  private event(tx: Tx | Db, jobId: string, type: string, actorId: string | null, meta: Record<string, unknown>) {
    return tx.insert(jobEvents).values({ jobId, type, actorId, meta });
  }

  private async tell(job: JobRow, to: "shipper" | "carrier", body: string) {
    await this.notifications
      .notify(to === "shipper" ? job.shipperId : job.carrierId, {
        type: "job_update",
        title: "İş durumu",
        body,
        data: { type: "job", jobId: job.id },
      })
      .catch((e: Error) => this.logger.warn(`Bildirim gitmedi (${job.id}): ${e.message}`));
  }

  private statusConflict(status: JobStatus) {
    return new ConflictException(`İş "${JOB_STATUS_LABELS[status]}" durumunda; bu işlem yapılamaz`);
  }

  private codeLocked() {
    return new HttpException("Teslim kodu çok kez yanlış girildi; yük sahibinden yeni kod isteyin", HttpStatus.TOO_MANY_REQUESTS);
  }

  private selectJobs() {
    return this.db
      .select({
        job: jobs,
        load: {
          id: loadPosts.id,
          loadFrom: loadPosts.loadFrom,
          loadTo: loadPosts.loadTo,
          cargoType: loadPosts.cargoType,
          weightTon: loadPosts.weightTon,
          note: loadPosts.note,
        },
        origin: { district: od.name, province: op.name },
        dest: { district: dd.name, province: dp.name },
        vehicle: { plate: vehicles.plate, vehicleType: vehicles.vehicleType, bodyType: vehicles.bodyType, capacityTon: vehicles.capacityTon },
        shipper: { name: shipperU.name, phone: shipperU.phone, level: shipperU.verificationLevel, company: shipperC.title },
        carrier: { name: carrierU.name, phone: carrierU.phone, level: carrierU.verificationLevel, company: carrierC.title },
      })
      .from(jobs)
      .innerJoin(loadPosts, eq(loadPosts.id, jobs.loadPostId))
      .innerJoin(od, eq(od.id, loadPosts.originDistrictId))
      .innerJoin(op, eq(op.id, od.provinceId))
      .innerJoin(dd, eq(dd.id, loadPosts.destDistrictId))
      .innerJoin(dp, eq(dp.id, dd.provinceId))
      .innerJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
      .innerJoin(shipperU, eq(shipperU.id, jobs.shipperId))
      .innerJoin(carrierU, eq(carrierU.id, jobs.carrierId))
      .leftJoin(shipperC, eq(shipperC.ownerUserId, jobs.shipperId))
      .leftJoin(carrierC, eq(carrierC.ownerUserId, jobs.carrierId))
      .$dynamic();
  }

  private view(r: Awaited<ReturnType<JobsService["selectJobs"]>>[number], userId: string) {
    const j = r.job;
    const role = j.shipperId === userId ? "shipper" : "carrier";
    const other = role === "shipper" ? r.carrier : r.shipper;
    return {
      id: j.id,
      role,
      status: j.status,
      agreedPrice: j.agreedPrice,
      load: { ...r.load, origin: r.origin, dest: r.dest },
      vehicle: r.vehicle,
      // FR-32: iş oluştu, numaralar karşılıklı tam görünür
      counterpart: { displayName: other.company ?? other.name, phone: other.phone, verified: isVerifiedBadge(other.level) },
      deliveryCodeAttemptsLeft: Math.max(0, JOB_PARAMS.deliveryCodeMaxAttempts - j.deliveryCodeAttempts),
      createdAt: j.createdAt,
      deliveredAt: j.deliveredAt,
      completedAt: j.completedAt,
      autoCompleteAt: j.status === "teslim_edildi" && j.deliveredAt ? new Date(j.deliveredAt.getTime() + JOB_PARAMS.autoCompleteH * HOUR) : null,
      cancelReason: j.cancelReason,
    };
  }
}
