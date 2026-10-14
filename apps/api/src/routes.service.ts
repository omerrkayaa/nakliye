import { Global, Inject, Injectable, Logger, Module } from "@nestjs/common";
import { haversineKm, ROAD_FACTOR, type LatLng } from "@nakliye/shared";
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

  private async centers(from: number, to: number) {
    const r = await this.db.execute<{ flng: number; flat: number; tlng: number; tlat: number }>(sql`
      select ST_X(o.geom) as flng, ST_Y(o.geom) as flat, ST_X(d.geom) as tlng, ST_Y(d.geom) as tlat
      from districts o, districts d where o.id = ${from} and d.id = ${to}
    `);
    return r.rows[0];
  }

  /**
   * F4 (BR-23): ilçe merkezleri arası karayolu çizgisi ve mesafesi. OSRM'nin sadeleştirilmiş geometrisi çift başına bir
   * kez sorulur, `district_routes.geometry`'de saklanır. OSRM yoksa ya da cevap vermezse kuş uçuşu doğru çizgi ve
   * mesafe × ROAD_FACTOR (`source: "kus_ucusu"`): rota üstü yine hesaplanır, daha kaba.
   */
  async routeLine(from: number, to: number): Promise<{ km: number; line: LatLng[]; source: "osrm" | "kus_ucusu" }> {
    const [hit] = await this.db
      .select({ m: districtRoutes.distanceM, geometry: districtRoutes.geometry })
      .from(districtRoutes)
      .where(and(eq(districtRoutes.originDistrictId, from), eq(districtRoutes.destDistrictId, to)));
    if (hit?.geometry) return { km: hit.m / 1000, line: hit.geometry.map(([lng, lat]) => ({ lat, lng })), source: "osrm" };
    const p = await this.centers(from, to);
    if (!p) throw new Error(`İlçe bulunamadı (${from} → ${to})`);
    const a = { lat: p.flat, lng: p.flng };
    const b = { lat: p.tlat, lng: p.tlng };
    if (this.url) {
      try {
        const res = await fetch(`${this.url}/route/v1/driving/${p.flng},${p.flat};${p.tlng},${p.tlat}?overview=simplified&geometries=geojson`, {
          signal: AbortSignal.timeout(5000),
        });
        const body = (await res.json()) as { code?: string; routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[] };
        const route = body.code === "Ok" ? body.routes?.[0] : undefined;
        const coords = route?.geometry?.coordinates;
        if (route && coords && coords.length >= 2) {
          const row = { distanceM: Math.round(route.distance), durationS: Math.round(route.duration), geometry: coords };
          await this.db
            .insert(districtRoutes)
            .values({ originDistrictId: from, destDistrictId: to, ...row })
            .onConflictDoUpdate({ target: [districtRoutes.originDistrictId, districtRoutes.destDistrictId], set: { geometry: coords } });
          return { km: route.distance / 1000, line: coords.map(([lng, lat]) => ({ lat, lng })), source: "osrm" };
        }
        this.logger.warn(`OSRM rota çizgisi bulamadı (${from} → ${to}): ${body.code ?? res.status}`);
      } catch (e) {
        this.logger.warn(`OSRM'ye ulaşılamadı (${from} → ${to}): ${(e as Error).message}`);
      }
    }
    return { km: haversineKm(a, b) * ROAD_FACTOR, line: [a, b], source: "kus_ucusu" };
  }

  async roadKm(from: number, to: number): Promise<number | null> {
    const [hit] = await this.db
      .select({ m: districtRoutes.distanceM })
      .from(districtRoutes)
      .where(and(eq(districtRoutes.originDistrictId, from), eq(districtRoutes.destDistrictId, to)));
    if (hit) return hit.m / 1000;
    if (!this.url) return null;

    const p = await this.centers(from, to);
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

/** Global: fiyat aralığı (F7), güzergâh sayfaları (W2) ve dönüş planı (F4) aynı OSRM önbelleğini kullanır. */
@Global()
@Module({ providers: [RoutesService], exports: [RoutesService] })
export class RoutesModule {}
