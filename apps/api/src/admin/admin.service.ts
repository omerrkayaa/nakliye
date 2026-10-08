import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { VISIBLE_LOAD_STATUSES, type AdminReportListInput, type ResolveReportInput } from "@nakliye/shared";
import { and, count, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DB, type Db } from "../db/db.module.js";
import { capacityPosts, districts, loadPosts, offers, provinces, refreshTokens, reports, userRoles, users } from "../db/schema.js";
import { OffersService } from "../jobs/offers.service.js";
import { LoadsService } from "../loads/loads.service.js";
import { TrustService } from "../ratings/trust.service.js";
import { CapacityService } from "../vehicles/capacity.service.js";

const PAGE_SIZE = 20;
const reporter = alias(users, "reporter");
const od = alias(districts, "od");
const op = alias(provinces, "op");
const dd = alias(districts, "dd");
const dp = alias(provinces, "dp");

/** Askıya alınca kapanan ilanlar: yayındakiler ve moderasyonda bekleyenler */
const CLOSABLE_LOADS = [...VISIBLE_LOAD_STATUSES, "moderasyonda" as const];

type UserRow = { id: string; name: string | null; phone: string; status: string; trustScore: number; suspendedAt: Date | null; suspendReason: string | null };

/** Yönetici işleri (FR-51): şikayet kuyruğu (Y3), kullanıcı arama ve askıya alma (Y2). */
@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly loads: LoadsService,
    private readonly capacity: CapacityService,
    private readonly offersService: OffersService,
    private readonly trust: TrustService,
  ) {}

  // ── Şikayetler (Y3) ───────────────────────────────────────────────

  /**
   * Açık şikayetler eskiden yeniye (önce bekleyen ilk); kapalılar yeniden eskiye. Her satırda hedefin özeti,
   * hedefin sahibi (ilan için ilan sahibi) ve aynı hedefe açık şikayet sayısı.
   */
  async listReports({ status, page }: AdminReportListInput) {
    const open = status === "acik";
    const rows = await this.db
      .select({
        report: reports,
        reporter: { id: reporter.id, name: reporter.name, phone: reporter.phone },
        openOnTarget: sql<number>`(select count(*)::int from ${reports} r2 where r2.target_type = ${reports.targetType} and r2.target_id = ${reports.targetId} and r2.status = 'acik')`,
      })
      .from(reports)
      .innerJoin(reporter, eq(reporter.id, reports.reporterId))
      .where(open ? eq(reports.status, "acik") : ne(reports.status, "acik"))
      // Kapalılarda karar tarihi boş olan (eski, elle kapatılmış) kayıtlar sona: DESC varsayılanı NULL'ları başa koyar
      .orderBy(open ? reports.createdAt : sql`${reports.resolvedAt} desc nulls last`)
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    const items = rows.slice(0, PAGE_SIZE);

    const loadIds = items.filter((r) => r.report.targetType === "load_post").map((r) => r.report.targetId);
    const loadRows = loadIds.length
      ? await this.db
          .select({
            id: loadPosts.id,
            status: loadPosts.status,
            shipperId: loadPosts.shipperId,
            origin: { district: od.name, province: op.name },
            dest: { district: dd.name, province: dp.name },
          })
          .from(loadPosts)
          .innerJoin(od, eq(od.id, loadPosts.originDistrictId))
          .innerJoin(op, eq(op.id, od.provinceId))
          .innerJoin(dd, eq(dd.id, loadPosts.destDistrictId))
          .innerJoin(dp, eq(dp.id, dd.provinceId))
          .where(inArray(loadPosts.id, loadIds))
      : [];
    const loadById = new Map(loadRows.map((l) => [l.id, l]));

    const ownerIds = items.map((r) => (r.report.targetType === "user" ? r.report.targetId : loadById.get(r.report.targetId)?.shipperId)).filter((x): x is string => !!x);
    const owners = new Map((ownerIds.length ? await this.selectUsers().where(inArray(users.id, ownerIds)) : []).map((u) => [u.id, u]));

    return {
      items: items.map(({ report: r, reporter: rep, openOnTarget }) => {
        const load = r.targetType === "load_post" ? loadById.get(r.targetId) : undefined;
        const owner = owners.get(r.targetType === "user" ? r.targetId : (load?.shipperId ?? ""));
        return {
          id: r.id,
          reason: r.reason,
          note: r.note,
          status: r.status,
          resolution: r.resolution,
          createdAt: r.createdAt,
          resolvedAt: r.resolvedAt,
          reporter: rep,
          target: {
            type: r.targetType as "load_post" | "user",
            id: r.targetId,
            load: load ? { status: load.status, origin: load.origin, dest: load.dest } : null,
            owner: owner ? this.userView(owner) : null,
          },
          openOnTarget,
        };
      }),
      page,
      hasMore: rows.length > PAGE_SIZE,
    };
  }

  /** Şikayeti sonuçlandır. Haklıysa hedefin sahibinin güven skoru yenilenir (BR-30 şikayet terimi). */
  async resolveReport(adminId: string, id: string, input: ResolveReportInput, now = new Date()) {
    const [row] = await this.db
      .update(reports)
      .set({ status: input.decision, resolution: input.note ?? null, resolvedAt: now, resolvedBy: adminId })
      .where(and(eq(reports.id, id), eq(reports.status, "acik")))
      .returning({ targetType: reports.targetType, targetId: reports.targetId });
    if (!row) {
      const [exists] = await this.db.select({ id: reports.id }).from(reports).where(eq(reports.id, id));
      if (!exists) throw new NotFoundException("Şikayet bulunamadı");
      throw new ConflictException("Şikayet zaten sonuçlandırılmış");
    }
    if (input.decision === "hakli") {
      const ownerId =
        row.targetType === "user"
          ? row.targetId
          : (await this.db.select({ shipperId: loadPosts.shipperId }).from(loadPosts).where(eq(loadPosts.id, row.targetId)))[0]?.shipperId;
      if (ownerId) await this.trust.refresh(ownerId);
    }
    return { id, status: input.decision };
  }

  // ── Kullanıcılar (Y2) ─────────────────────────────────────────────

  /** Numara (en az 4 hane) ya da ad ile arama; q boşsa askıdakiler. */
  async listUsers(q: string | undefined, page: number) {
    const term = q?.trim();
    // Yalnız numara karakterleriyse numara araması ("0555 123", "+90555…"); değilse ad araması
    const isPhone = !!term && /^[\d\s+()-]+$/.test(term);
    const digits = term?.replace(/\D/g, "").replace(/^(90|0)/, "") ?? "";
    const where = !term
      ? eq(users.status, "askida")
      : isPhone
        ? digits.length >= 4
          ? ilike(users.phone, `%${digits}%`)
          : sql`false`
        : ilike(users.name, `%${term}%`);
    const rows = await this.selectUsers().where(where).orderBy(desc(users.createdAt)).limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE);
    return { items: rows.slice(0, PAGE_SIZE).map((u) => this.userView(u)), page, hasMore: rows.length > PAGE_SIZE };
  }

  /**
   * Askıya al (FR-51): giriş ve belirteç yenileme kapanır, oturumlar düşer (erişim belirteci en çok 15 dk daha
   * geçerli kalır), yayındaki/moderasyondaki ilanlar ve aktif boş araç ilanları iptal edilir, bekleyen teklifleri
   * geri çekilir. Süren işlere dokunulmaz: karşı tarafın taşıması yarım kalmasın.
   */
  async suspend(adminId: string, userId: string, reason: string, now = new Date()) {
    if (userId === adminId) throw new ConflictException("Kendinizi askıya alamazsınız");
    const [isAdmin] = await this.db.select({ n: count() }).from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, "admin")));
    if (isAdmin && isAdmin.n > 0) throw new ConflictException("Yönetici hesabı askıya alınamaz");

    const [row] = await this.db
      .update(users)
      .set({ status: "askida", suspendedAt: now, suspendReason: reason })
      .where(and(eq(users.id, userId), eq(users.status, "aktif")))
      .returning({ id: users.id });
    if (!row) {
      await this.user(userId); // yoksa 404
      throw new ConflictException("Hesap zaten askıda");
    }
    await this.db.update(refreshTokens).set({ revokedAt: now }).where(and(eq(refreshTokens.userId, userId), sql`${refreshTokens.revokedAt} is null`));

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
    // Kapanan ilanlara gelmiş bekleyen teklifler sonuçlanmadı sayılır (nakliyecilere bildirim)
    await this.offersService.rejectStale();

    return { user: this.userView(await this.user(userId)), closedLoads: openLoads.length, closedCapacity: openCaps.length, withdrawnOffers: withdrawn.length };
  }

  /** Askıyı kaldır. Kapanan ilanlar geri açılmaz (yayın tarihi ve teyit bilgisi eskidi). */
  async unsuspend(userId: string) {
    const [row] = await this.db
      .update(users)
      .set({ status: "aktif", suspendedAt: null, suspendReason: null })
      .where(and(eq(users.id, userId), eq(users.status, "askida")))
      .returning({ id: users.id });
    if (!row) {
      await this.user(userId);
      throw new ConflictException("Hesap askıda değil");
    }
    return { user: this.userView(await this.user(userId)) };
  }

  // ── Yardımcılar ────────────────────────────────────────────────────

  private selectUsers() {
    return this.db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        status: users.status,
        trustScore: users.trustScore,
        suspendedAt: users.suspendedAt,
        suspendReason: users.suspendReason,
      })
      .from(users)
      .$dynamic();
  }

  private async user(id: string) {
    const [u] = await this.selectUsers().where(eq(users.id, id));
    if (!u) throw new NotFoundException("Kullanıcı bulunamadı");
    return u;
  }

  private userView(u: UserRow) {
    return { ...u, trustScore: Math.round(u.trustScore * 100) / 100 };
  }
}
