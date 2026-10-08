import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ROUTE_ALERT_PARAMS, type CreateRouteAlertInput, type UpdateRouteAlertInput } from "@nakliye/shared";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DB, type Db } from "../db/db.module.js";
import { districts, provinces, routeAlerts } from "../db/schema.js";

const od = alias(districts, "od");
const op = alias(provinces, "op");
const dd = alias(districts, "dd");
const dp = alias(provinces, "dp");

/**
 * Rota alarmı (FR-22, UC-06): nakliyeci "nereden (ilçe ± km) → nereye (ilçe ± km ya da her yer)" kaydeder;
 * uyan teyitli yük yayına çıkınca eşleştirme (MatchingService.matchLoad) alarm sahibine bildirim gönderir.
 */
@Injectable()
export class AlertsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string) {
    const rows = await this.selectAlerts().where(eq(routeAlerts.userId, userId)).orderBy(desc(routeAlerts.createdAt));
    return { items: rows.map((r) => this.view(r)), maxActive: ROUTE_ALERT_PARAMS.maxActive };
  }

  async create(userId: string, input: CreateRouteAlertInput) {
    await this.checkDistricts(input.originDistrictId, input.destDistrictId);
    await this.checkActiveLimit(userId);
    const [row] = await this.db
      .insert(routeAlerts)
      .values({ userId, ...input })
      .returning({ id: routeAlerts.id });
    return this.get(userId, row!.id);
  }

  async update(userId: string, id: string, input: UpdateRouteAlertInput) {
    const alert = await this.owned(userId, id);
    await this.checkDistricts(input.originDistrictId, input.destDistrictId);
    if (input.active === true && !alert.active) await this.checkActiveLimit(userId);
    await this.db.update(routeAlerts).set(input).where(eq(routeAlerts.id, id));
    return this.get(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.db.delete(routeAlerts).where(eq(routeAlerts.id, id));
  }

  /**
   * Bu yüke uyan aktif alarmların sahipleri (kullanıcı başına bir satır; ilan sahibi hariç).
   * Mesafe ilçe merkezinden yük noktasına, metre cinsinden (::geography).
   */
  async ownersForLoad(loadId: string): Promise<{ userId: string; alertId: string }[]> {
    const r = await this.db.execute<{ user_id: string; alert_id: string }>(sql`
      select distinct on (ra.user_id) ra.user_id, ra.id as alert_id
      from route_alerts ra
      join load_posts l on l.id = ${loadId}
      join users u on u.id = ra.user_id and u.deleted_at is null
      join districts o on o.id = ra.origin_district_id
      left join districts d on d.id = ra.dest_district_id
      where ra.active
        and ra.user_id <> l.shipper_id
        and (ra.vehicle_type is null or ra.vehicle_type = l.vehicle_type)
        and ST_DWithin(o.geom::geography, l.origin_geom::geography, ra.origin_radius_km * 1000)
        and (ra.dest_district_id is null or ST_DWithin(d.geom::geography, l.dest_geom::geography, ra.dest_radius_km * 1000))
      order by ra.user_id, ra.created_at
    `);
    return r.rows.map((x) => ({ userId: x.user_id, alertId: x.alert_id }));
  }

  // ── Yardımcılar ────────────────────────────────────────────────────

  private async get(userId: string, id: string) {
    const [row] = await this.selectAlerts().where(and(eq(routeAlerts.id, id), eq(routeAlerts.userId, userId)));
    if (!row) throw new NotFoundException("Alarm bulunamadı");
    return this.view(row);
  }

  private async owned(userId: string, id: string) {
    const [alert] = await this.db.select().from(routeAlerts).where(and(eq(routeAlerts.id, id), eq(routeAlerts.userId, userId)));
    if (!alert) throw new NotFoundException("Alarm bulunamadı");
    return alert;
  }

  private async checkDistricts(...ids: (number | null | undefined)[]) {
    const wanted = [...new Set(ids.filter((x): x is number => typeof x === "number"))];
    if (wanted.length === 0) return;
    const found = await this.db.select({ id: districts.id }).from(districts).where(inArray(districts.id, wanted));
    if (found.length !== wanted.length) throw new BadRequestException("İlçe bulunamadı");
  }

  /** Sınır kontrolü ile ekleme arasında yarış olabilir (aynı anda 2 istek → 11. alarm); zararsız olduğu için kilit yok. */
  private async checkActiveLimit(userId: string) {
    const [{ n }] = (await this.db
      .select({ n: count() })
      .from(routeAlerts)
      .where(and(eq(routeAlerts.userId, userId), eq(routeAlerts.active, true)))) as [{ n: number }];
    if (n >= ROUTE_ALERT_PARAMS.maxActive) {
      throw new ConflictException(`En fazla ${ROUTE_ALERT_PARAMS.maxActive} aktif alarmınız olabilir; birini kapatın ya da silin`);
    }
  }

  private selectAlerts() {
    return this.db
      .select({
        alert: routeAlerts,
        origin: { districtId: od.id, district: od.name, province: op.name },
        dest: { districtId: dd.id, district: dd.name, province: dp.name },
      })
      .from(routeAlerts)
      .innerJoin(od, eq(od.id, routeAlerts.originDistrictId))
      .innerJoin(op, eq(op.id, od.provinceId))
      .leftJoin(dd, eq(dd.id, routeAlerts.destDistrictId))
      .leftJoin(dp, eq(dp.id, dd.provinceId))
      .$dynamic();
  }

  private view(r: Awaited<ReturnType<AlertsService["selectAlerts"]>>[number]) {
    const a = r.alert;
    return {
      id: a.id,
      origin: r.origin,
      originRadiusKm: a.originRadiusKm,
      dest: a.destDistrictId === null ? null : r.dest,
      destRadiusKm: a.destRadiusKm,
      vehicleType: a.vehicleType,
      active: a.active,
      createdAt: a.createdAt,
    };
  }
}
