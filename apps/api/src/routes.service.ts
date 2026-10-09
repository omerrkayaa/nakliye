import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { DB, type Db } from "./db/db.module.js";
import { districtRoutes } from "./db/schema.js";

/**
 * F7 karayolu mesafesi: ilçe merkezleri arası, kendi sunucumuzdaki OSRM'den (ücretsiz, OpenStreetMap verisi; kurulum
 * infra/osrm.md). Her ilçe çifti bir kez sorulur, `district_routes`'ta saklanır. OSRM_URL yoksa ya da OSRM cevap
 * vermezse null döner; çağıran kuş uçuşu tahminine düşer (fiyat aralığı yine gösterilir).
 */
@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);
  private readonly url = process.env.OSRM_URL?.replace(/\/$/, "");

  constructor(@Inject(DB) private readonly db: Db) {}

  async roadKm(from: number, to: number): Promise<number | null> {
    const [hit] = await this.db
      .select({ m: districtRoutes.distanceM })
      .from(districtRoutes)
      .where(and(eq(districtRoutes.originDistrictId, from), eq(districtRoutes.destDistrictId, to)));
    if (hit) return hit.m / 1000;
    if (!this.url) return null;

    const r = await this.db.execute<{ flng: number; flat: number; tlng: number; tlat: number }>(sql`
      select ST_X(o.geom) as flng, ST_Y(o.geom) as flat, ST_X(d.geom) as tlng, ST_Y(d.geom) as tlat
      from districts o, districts d where o.id = ${from} and d.id = ${to}
    `);
    const p = r.rows[0];
    if (!p) return null;
    try {
      const res = await fetch(`${this.url}/route/v1/driving/${p.flng},${p.flat};${p.tlng},${p.tlat}?overview=false`, {
        signal: AbortSignal.timeout(3000),
      });
      const body = (await res.json()) as { code?: string; routes?: { distance: number; duration: number }[] };
      const route = body.code === "Ok" ? body.routes?.[0] : undefined;
      if (!route) {
        this.logger.warn(`OSRM rota bulamadı (${from} → ${to}): ${body.code ?? res.status}`);
        return null;
      }
      await this.db
        .insert(districtRoutes)
        .values({ originDistrictId: from, destDistrictId: to, distanceM: Math.round(route.distance), durationS: Math.round(route.duration) })
        .onConflictDoNothing();
      return route.distance / 1000;
    } catch (e) {
      this.logger.warn(`OSRM'ye ulaşılamadı (${from} → ${to}): ${(e as Error).message}`);
      return null;
    }
  }
}
