import { BadRequestException, Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { corridorEstimate, roadEstimate, trDay, VEHICLE_SIZE_ORDER, VISIBLE_LOAD_STATUSES } from "@nakliye/shared";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DB, type Db } from "./db/db.module.js";
import { SettingsService } from "./settings/settings.service.js";
import { districts, loadPosts } from "./db/schema.js";
import { RoutesService } from "./routes.service.js";

const od = alias(districts, "od");
const dd = alias(districts, "dd");

/**
 * W2 güzergâh sayfası (web /nakliye/<il>-<il>); girişsiz. İl → il: yük akışında görünen ilan sayısı (aynı süzgeç:
 * teyitli/teyit bekliyor, yükleme günü geçmemiş) ve araç tiplerine göre F7 fiyat aralığı. Mesafe, her ilin temsil
 * ilçesi (il merkezine en yakın ilçe) arasında; OSRM yoksa kuş uçuşu × yol katsayısı. Numara ya da ilan kimliği dönmez.
 */
@Controller("public/routes")
export class PublicRoutesController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly routes: RoutesService,
    private readonly settings: SettingsService,
  ) {}

  @Get(":from/:to")
  async show(@Param("from") fromParam: string, @Param("to") toParam: string) {
    const from = Number(fromParam), to = Number(toParam);
    if (!Number.isInteger(from) || !Number.isInteger(to)) throw new NotFoundException("İl bulunamadı");
    if (from === to) throw new BadRequestException("Kalkış ve varış ili farklı olmalı");

    const r = await this.db.execute<{ id: number; name: string; district_id: number }>(sql`
      select p.id, p.name,
        (select d.id from districts d where d.province_id = p.id order by d.geom <-> p.geom limit 1) as district_id
      from provinces p where p.id in (${from}, ${to})
    `);
    const origin = r.rows.find((p) => p.id === from), dest = r.rows.find((p) => p.id === to);
    if (!origin || !dest) throw new NotFoundException("İl bulunamadı");

    const [{ n }] = (await this.db
      .select({ n: count() })
      .from(loadPosts)
      .innerJoin(od, eq(od.id, loadPosts.originDistrictId))
      .innerJoin(dd, eq(dd.id, loadPosts.destDistrictId))
      .where(
        and(
          eq(od.provinceId, from),
          eq(dd.provinceId, to),
          inArray(loadPosts.status, [...VISIBLE_LOAD_STATUSES]),
          gte(loadPosts.loadTo, trDay(new Date())),
        ),
      )) as [{ n: number }];

    const road = await this.routes.roadKm(origin.district_id, dest.district_id);
    let straight = 0;
    if (road === null) {
      const s = await this.db.execute<{ km: number }>(sql`
        select ST_Distance(o.geom::geography, d.geom::geography) / 1000 as km
        from districts o, districts d where o.id = ${origin.district_id} and d.id = ${dest.district_id}
      `);
      straight = Number(s.rows[0]?.km ?? 0);
    }
    const p = await this.settings.price();
    const estimate = (t: (typeof VEHICLE_SIZE_ORDER)[number]) => (road !== null ? roadEstimate(road, t, p) : corridorEstimate(straight, t, p));
    const types = [...VEHICLE_SIZE_ORDER].reverse(); // büyükten küçüğe: tır önce
    return {
      from: { id: origin.id, name: origin.name },
      to: { id: dest.id, name: dest.name },
      activeLoads: n,
      distanceKm: estimate("tir").distanceKm, // mesafe araç tipinden bağımsız
      source: road !== null ? ("karayolu" as const) : ("kus_ucusu" as const),
      estimates: types.map((t) => {
        const e = estimate(t);
        return { vehicleType: t, min: e.min, max: e.max };
      }),
    };
  }
}
