import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ABUSE_LIMITS,
  applyConfirmationAnswer,
  canTransition,
  createLoadSchema,
  isVerifiedBadge,
  loadDateError,
  LOAD_STATUS_LABELS,
  maskPhone,
  needsModeration,
  nextReminderAt,
  trDay,
  trDayStart,
  VISIBLE_LOAD_STATUSES,
  EDITABLE_LOAD_STATUSES,
  type ConfirmationAnswer,
  type CreateLoadInput,
  type LoadSearchInput,
  type LoadStatus,
  type UpdateLoadInput,
} from "@nakliye/shared";
import { and, asc, count, countDistinct, desc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomBytes } from "node:crypto";
import { DB, type Db, type Tx } from "../db/db.module.js";
import { callLogs, capacityPosts, companies, districts, loadConfirmations, loadPosts, matches, provinces, users } from "../db/schema.js";
import { MatchingService } from "../matching/matching.service.js";

const PAGE_SIZE = 20;
const PG_UNIQUE_VIOLATION = "23505";

export type LoadRow = typeof loadPosts.$inferSelect;

const od = alias(districts, "od");
const op = alias(provinces, "op");
const dd = alias(districts, "dd");
const dp = alias(provinces, "dp");

/** WhatsApp paylaşım linki kimliği (F8): 10 karakter, URL'de güvenli. */
const newShareId = () => randomBytes(8).toString("base64url").slice(0, 10);

@Injectable()
export class LoadsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly matching: MatchingService,
  ) {}

  // ── Okuma ──────────────────────────────────────────────────────────

  /** Yük arama (FR-20, FR-21): yalnız görünür ilanlar; teyitli önce, sonra en yakın / en taze teyit. */
  async search(q: LoadSearchInput, now = new Date()) {
    const where: SQL[] = [inArray(loadPosts.status, [...VISIBLE_LOAD_STATUSES]), gte(loadPosts.loadTo, trDay(now))];
    if (q.fromProvinceId) where.push(eq(op.id, q.fromProvinceId));
    if (q.toProvinceId) where.push(eq(dp.id, q.toProvinceId));
    if (q.date) where.push(lte(loadPosts.loadFrom, q.date), gte(loadPosts.loadTo, q.date));
    if (q.vehicleType) where.push(eq(loadPosts.vehicleType, q.vehicleType));
    // Kasa tipi belirtilmemiş yük her kasaya uyar
    if (q.bodyType) where.push(or(isNull(loadPosts.bodyType), eq(loadPosts.bodyType, q.bodyType))!);
    if (q.maxWeightTon) where.push(lte(loadPosts.weightTon, q.maxWeightTon));

    let distance: SQL<number> | undefined;
    if (q.near) {
      const here = sql`ST_SetSRID(ST_MakePoint(${q.near.lng}::float8, ${q.near.lat}::float8), 4326)::geography`;
      distance = sql<number>`ST_Distance(${loadPosts.originGeom}::geography, ${here}) / 1000`;
      where.push(sql`ST_DWithin(${loadPosts.originGeom}::geography, ${here}, ${q.radiusKm * 1000})`);
    }

    const rows = await this.selectLoads(distance)
      .where(and(...where))
      .orderBy(
        sql`case when ${loadPosts.status} = 'teyitli' then 0 else 1 end`,
        ...(distance ? [asc(distance)] : []),
        desc(loadPosts.lastConfirmedAt),
      )
      .limit(PAGE_SIZE + 1)
      .offset((q.page - 1) * PAGE_SIZE);

    return this.page(rows, q.page, (r) => this.view(r, false));
  }

  /** Yük sahibinin kendi ilanları (A18 "İlanlarım"), tüm durumlar. */
  async mine(userId: string, page: number) {
    const rows = await this.selectLoads()
      .where(eq(loadPosts.shipperId, userId))
      .orderBy(desc(loadPosts.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    return this.page(rows, page, (r) => this.view(r, true));
  }

  /** İlan detayı. Sahibi her durumda görür; başkaları yalnız görünür ilanları. */
  async get(userId: string, id: string) {
    const [row] = await this.selectLoads().where(eq(loadPosts.id, id));
    const owner = row?.load.shipperId === userId;
    if (!row || (!owner && !VISIBLE_LOAD_STATUSES.includes(row.load.status))) {
      throw new NotFoundException("İlan bulunamadı");
    }
    return this.view(row, owner);
  }

  // ── Yazma ──────────────────────────────────────────────────────────

  /** Yeni ilan (FR-10). BR-01: teyitli doğar; BR-11: gerekiyorsa moderasyona girer. */
  async create(userId: string, input: CreateLoadInput, now = new Date()) {
    const dateError = loadDateError(input.loadFrom, input.loadTo, now);
    if (dateError) throw new BadRequestException(dateError);

    const found = await this.db
      .select({ id: districts.id, geom: districts.geom })
      .from(districts)
      .where(inArray(districts.id, [input.originDistrictId, input.destDistrictId]));
    const origin = found.find((d) => d.id === input.originDistrictId);
    const dest = found.find((d) => d.id === input.destDistrictId);
    if (!origin || !dest) throw new BadRequestException("Kalkış ya da varış ilçesi bulunamadı");

    const [user] = await this.db.select({ level: users.verificationLevel }).from(users).where(eq(users.id, userId));
    const [{ approved }] = (await this.db
      .select({ approved: count() })
      .from(loadPosts)
      .where(and(eq(loadPosts.shipperId, userId), eq(loadPosts.moderation, "onay")))) as [{ approved: number }];
    const moderate = needsModeration(user?.level ?? 0, approved);

    const values = {
      ...input,
      note: input.note ?? null,
      shipperId: userId,
      originGeom: origin.geom,
      destGeom: dest.geom,
      status: (moderate ? "moderasyonda" : "teyitli") as LoadStatus,
      moderation: moderate ? ("bekliyor" as const) : null,
      lastConfirmedAt: now,
      nextReminderAt: nextReminderAt(now, trDayStart(input.loadFrom)),
    };

    // shareId çakışması çok düşük olasılık; olursa yeni kimlikle tekrar dene
    for (let attempt = 0; ; attempt++) {
      try {
        const [row] = await this.db
          .insert(loadPosts)
          .values({ ...values, shareId: newShareId() })
          .returning({ id: loadPosts.id });
        if (values.status === "teyitli") this.matching.schedule("load", row!.id);
        return this.get(userId, row!.id);
      } catch (e) {
        const err = e as { code?: string; cause?: { code?: string } };
        if ((err.cause?.code ?? err.code) !== PG_UNIQUE_VIOLATION || attempt >= 2) throw e;
      }
    }
  }

  /**
   * İlanı düzenle. Kalkış/varış değişmez. Görünür ilanda düzenleme sahibinin "hâlâ geçerli" teyidi sayılır:
   * sahibi ilanla ilgileniyor ve bilgiler az önce güncellendi.
   */
  async update(userId: string, id: string, patch: UpdateLoadInput, now = new Date()) {
    const load = await this.ownLoad(userId, id);
    if (!EDITABLE_LOAD_STATUSES.includes(load.status)) throw this.statusConflict(load.status, "düzenlenemez");

    const merged = {
      originDistrictId: load.originDistrictId,
      destDistrictId: load.destDistrictId,
      loadFrom: patch.loadFrom ?? load.loadFrom,
      loadTo: patch.loadTo ?? load.loadTo,
      cargoType: patch.cargoType ?? load.cargoType,
      weightTon: patch.weightTon ?? load.weightTon,
      vehicleType: patch.vehicleType ?? load.vehicleType,
      bodyType: patch.bodyType !== undefined ? patch.bodyType : load.bodyType,
      priceType: patch.priceType ?? load.priceType,
      price: patch.price !== undefined ? patch.price : load.price,
      note: (patch.note !== undefined ? patch.note : load.note) ?? undefined,
    };
    const checked = createLoadSchema.safeParse(merged);
    if (!checked.success) {
      throw new BadRequestException({
        message: "Geçersiz istek",
        errors: checked.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const dateError = loadDateError(merged.loadFrom, merged.loadTo, now);
    if (dateError) throw new BadRequestException(dateError);

    const { originDistrictId, destDistrictId, ...fields } = checked.data;
    const reconfirm = VISIBLE_LOAD_STATUSES.includes(load.status);
    await this.db.transaction(async (tx) => {
      await this.transition(tx, load, reconfirm ? "teyitli" : load.status, {
        ...fields,
        note: fields.note ?? null,
        // Yayındaki ilan düzenlenince eşleşmeler yeni bilgilerle yeniden aranır (moderasyondaki onayda aranacak)
        ...(reconfirm ? { ...this.confirmedFields(merged.loadFrom, now), matchedAt: null } : {}),
      });
      if (reconfirm) await this.answerOpenQuestion(tx, load.id, "gecerli", now);
    });
    if (reconfirm) this.matching.schedule("load", id);
    return this.get(userId, id);
  }

  /** "Hâlâ geçerli mi?" cevabı, uygulamadan (UC-04, BR-02…04). */
  async confirm(userId: string, id: string, answer: ConfirmationAnswer, now = new Date()) {
    const load = await this.ownLoad(userId, id);
    await this.applyAnswer(load, answer, "app", now);
    return this.get(userId, id);
  }

  /**
   * Teyit cevabını uygular; uygulama ve SMS linki (public/confirm) aynı yolu kullanır.
   * Yalnız görünür ilan cevaplanabilir; yükleme tarihi geçmişse "geçerli" denemez.
   */
  async applyAnswer(load: LoadRow, answer: ConfirmationAnswer, channel: "app" | "sms", now = new Date()): Promise<LoadStatus> {
    if (!VISIBLE_LOAD_STATUSES.includes(load.status)) throw this.statusConflict(load.status, "teyit edilemez");
    if (answer === "gecerli" && load.loadTo < trDay(now)) {
      throw new ConflictException("Yükleme tarihi geçmiş; tarihi güncelleyin ya da ilanı kapatın");
    }

    const to = applyConfirmationAnswer(answer);
    // "Teyit bekliyor"dan geri dönen ilan yeniden eşleştirilir: beklerken açılan boş araç ilanları onu görmemişti
    const rematch = load.status === "teyit_bekliyor" && to === "teyitli";
    await this.db.transaction(async (tx) => {
      await this.transition(tx, load, to, {
        reminderSentAt: null,
        ...(to === "teyitli" ? this.confirmedFields(load.loadFrom, now) : {}),
        ...(rematch ? { matchedAt: null } : {}),
      });
      await this.answerOpenQuestion(tx, load.id, answer, now, channel);
    });
    if (rematch) this.matching.schedule("load", load.id);
    return to;
  }

  /** İlanı kapat (FR-15): araç bulundu → kapandı, vazgeçildi → iptal. Moderasyondaki ilan yalnız iptal edilebilir. */
  async close(userId: string, id: string, reason: "arac_bulundu" | "iptal", now = new Date()) {
    const load = await this.ownLoad(userId, id);
    const to = applyConfirmationAnswer(reason);
    await this.db.transaction(async (tx) => {
      await this.transition(tx, load, to, { reminderSentAt: null });
      await this.answerOpenQuestion(tx, load.id, reason, now);
    });
    return this.get(userId, id);
  }

  /**
   * "Ara" (FR-30, BR-40): ilan sahibinin numarasını açar ve aramayı loglar. BR-12: dönen numara ilanı veren
   * hesabın kendi (OTP ile doğrulanmış) numarasıdır; ilana ayrı numara yazılamaz. Numara toplamaya karşı
   * 24 saatte farklı ilan sayısı sınırlıdır; aynı ilanı tekrar aramak sınırı tüketmez.
   */
  async call(userId: string, id: string, now = new Date()) {
    const [row] = await this.selectLoads().where(eq(loadPosts.id, id));
    if (!row || !VISIBLE_LOAD_STATUSES.includes(row.load.status)) throw new NotFoundException("İlan bulunamadı");
    if (row.load.shipperId === userId) throw new BadRequestException("Kendi ilanınızı arayamazsınız");

    const since = new Date(now.getTime() - 24 * 3_600_000);
    const [{ loads }] = (await this.db
      .select({ loads: countDistinct(callLogs.loadPostId) })
      .from(callLogs)
      .where(and(eq(callLogs.callerId, userId), gte(callLogs.createdAt, since), ne(callLogs.loadPostId, id)))) as [
      { loads: number },
    ];
    if (loads >= ABUSE_LIMITS.callsPerDay) {
      throw new HttpException(
        `Günlük arama sınırına ulaştınız (${ABUSE_LIMITS.callsPerDay} farklı ilan). Yarın tekrar deneyin.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.db.insert(callLogs).values({ callerId: userId, loadPostId: id, createdAt: now });
    // Tez metriği "eşleşme isabeti": arayanın boş araç ilanıyla bu yük arasında eşleşme varsa aramaya dönüştü say
    await this.db
      .update(matches)
      .set({ outcome: "arandi" })
      .where(
        and(
          eq(matches.loadPostId, id),
          inArray(matches.capacityPostId, this.db.select({ id: capacityPosts.id }).from(capacityPosts).where(eq(capacityPosts.carrierId, userId))),
          or(isNull(matches.outcome), eq(matches.outcome, "goruldu")),
        ),
      );
    return { phone: row.shipperPhone, displayName: row.companyTitle ?? row.shipperName };
  }

  /**
   * Teklif kabulünde ilanı kapatır (FR-31): durum makinesine uyar, açık teyit sorusunu "araç bulundu" diye kapatır.
   * Çağıranın transaction'ında çalışır (iş kaydıyla birlikte ya hep ya hiç).
   */
  async closeForJob(tx: Tx, load: LoadRow, now: Date) {
    await this.transition(tx, load, "kapandi", { reminderSentAt: null });
    await this.answerOpenQuestion(tx, load.id, "arac_bulundu", now);
  }

  // ── Moderasyon (BR-11) ─────────────────────────────────────────────

  async moderationQueue(page: number) {
    const rows = await this.selectLoads()
      .where(eq(loadPosts.status, "moderasyonda"))
      .orderBy(asc(loadPosts.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    return this.page(rows, page, (r) => ({ ...this.view(r, true), shipperPhone: r.shipperPhone }));
  }

  async review(id: string, decision: "onay" | "ret", now = new Date()) {
    const [load] = await this.db.select().from(loadPosts).where(eq(loadPosts.id, id));
    if (!load) throw new NotFoundException("İlan bulunamadı");
    if (load.status !== "moderasyonda") throw this.statusConflict(load.status, "moderasyonda değil");

    if (decision === "ret") {
      await this.transition(this.db, load, "iptal", { moderation: "ret" });
    } else {
      await this.db.transaction(async (tx) => {
        // Yayına çıktığı an BR-01: son teyit = şimdi
        await this.transition(tx, load, "teyitli", { moderation: "onay", ...this.confirmedFields(load.loadFrom, now) });
        // Onay gecikip yükleme tarihi geçtiyse: onaylı sayılır (BR-11 muafiyetine yazılır) ama yayında kalmaz
        if (load.loadTo < trDay(now)) await this.transition(tx, { ...load, status: "teyitli" }, "suresi_doldu", {});
      });
      this.matching.schedule("load", id);
    }
    const [row] = await this.selectLoads().where(eq(loadPosts.id, id));
    return this.view(row!, true);
  }

  // ── Yardımcılar ────────────────────────────────────────────────────

  private selectLoads(distance?: SQL<number>) {
    return this.db
      .select({
        load: loadPosts,
        origin: { districtId: od.id, district: od.name, provinceId: op.id, province: op.name },
        dest: { districtId: dd.id, district: dd.name, provinceId: dp.id, province: dp.name },
        shipperName: users.name,
        shipperLevel: users.verificationLevel,
        shipperPhone: users.phone, // yanıta yalnız maskeli çıkar (view); tam numara sadece call() ve yöneticide
        companyTitle: companies.title,
        distanceKm: distance ?? sql<null>`null`,
      })
      .from(loadPosts)
      .innerJoin(od, eq(od.id, loadPosts.originDistrictId))
      .innerJoin(op, eq(op.id, od.provinceId))
      .innerJoin(dd, eq(dd.id, loadPosts.destDistrictId))
      .innerJoin(dp, eq(dp.id, dd.provinceId))
      .innerJoin(users, eq(users.id, loadPosts.shipperId))
      .leftJoin(companies, eq(companies.ownerUserId, loadPosts.shipperId))
      .$dynamic();
  }

  private view(r: Awaited<ReturnType<LoadsService["selectLoads"]>>[number], owner: boolean) {
    const l = r.load;
    return {
      id: l.id,
      shareId: l.shareId,
      status: l.status,
      origin: r.origin,
      dest: r.dest,
      loadFrom: l.loadFrom,
      loadTo: l.loadTo,
      cargoType: l.cargoType,
      weightTon: l.weightTon,
      vehicleType: l.vehicleType,
      bodyType: l.bodyType,
      priceType: l.priceType,
      price: l.price,
      note: l.note,
      lastConfirmedAt: l.lastConfirmedAt,
      createdAt: l.createdAt,
      ...(r.distanceKm !== null ? { distanceKm: Math.round(Number(r.distanceKm) * 10) / 10 } : {}),
      // BR-40: numara maskeli; tam numara POST /loads/:id/call ile loglanarak açılır
      shipper: {
        displayName: r.companyTitle ?? r.shipperName,
        verified: isVerifiedBadge(r.shipperLevel),
        phoneMasked: maskPhone(r.shipperPhone),
      },
      ...(owner ? { nextReminderAt: l.nextReminderAt, reminderSentAt: l.reminderSentAt, moderation: l.moderation } : {}),
    };
  }

  private page<R, V>(rows: R[], page: number, map: (r: R) => V) {
    return { items: rows.slice(0, PAGE_SIZE).map(map), page, hasMore: rows.length > PAGE_SIZE };
  }

  /** Sahibi değilse de 404: başkasının ilanının varlığını sızdırmamak için. */
  private async ownLoad(userId: string, id: string): Promise<LoadRow> {
    const [load] = await this.db.select().from(loadPosts).where(eq(loadPosts.id, id));
    if (!load || load.shipperId !== userId) throw new NotFoundException("İlan bulunamadı");
    return load;
  }

  private confirmedFields(loadFrom: string, now: Date) {
    return { lastConfirmedAt: now, reminderSentAt: null, nextReminderAt: nextReminderAt(now, trDayStart(loadFrom)) };
  }

  /**
   * Durum geçişi: diyagrama uygun mu bakar ve "durum hâlâ okuduğumuz gibiyse" günceller (iyimser kilit).
   * Zamanlayıcı aynı anda ilanı "teyit bekliyor"a çekerse kullanıcının işlemi 409 alır, veri ezilmez.
   */
  private async transition(tx: Tx | Db, load: LoadRow, to: LoadStatus, set: Partial<typeof loadPosts.$inferInsert>) {
    if (!canTransition(load.status, to)) throw this.statusConflict(load.status, "bu işlem yapılamaz");
    const updated = await tx
      .update(loadPosts)
      .set({ ...set, status: to })
      .where(and(eq(loadPosts.id, load.id), eq(loadPosts.status, load.status)))
      .returning({ id: loadPosts.id });
    if (updated.length === 0) throw new ConflictException("İlanın durumu az önce değişti; yenileyip tekrar deneyin");
  }

  /** Açık bir "hâlâ geçerli mi?" sorusu varsa cevabı işler (tez metriği: cevap süresi). Kendiliğinden teyit kaydedilmez. */
  private async answerOpenQuestion(tx: Tx, loadId: string, answer: ConfirmationAnswer, now: Date, channel: "app" | "sms" = "app") {
    await tx
      .update(loadConfirmations)
      .set({ answeredAt: now, answer, channel })
      .where(and(eq(loadConfirmations.loadPostId, loadId), isNull(loadConfirmations.answer)));
  }

  private statusConflict(status: LoadStatus, what: string) {
    return new ConflictException(`İlan "${LOAD_STATUS_LABELS[status]}" durumunda; ${what}`);
  }
}
