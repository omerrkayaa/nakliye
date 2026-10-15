import { Controller, Get, Inject, NotFoundException, Query, UseGuards } from "@nestjs/common";
import { corridorEstimate, priceEstimateSchema, roadEstimate, type PriceEstimateInput } from "@nakliye/shared";
import { sql } from "drizzle-orm";
import { AuthGuard } from "./auth/auth.guard.js";
import { ZodPipe } from "./common/zod.pipe.js";
import { DB, type Db } from "./db/db.module.js";
import { RoutesService } from "./routes.service.js";
import { SettingsService } from "./settings/settings.service.js";

/**
 * F7 koridor fiyat aralığı (FR-25, docs/04 §7): ilçe merkezleri arası karayolu mesafesi (OSRM, önbellekli) ile araç
 * tipine göre maliyet ve kâr bandı. OSRM yoksa kuş uçuşu × yol katsayısına düşer (`source`). Otoyol/köprü ücreti yok.
 */
@Controller("price-estimate")
@UseGuards(AuthGuard)
export class PriceController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly routes: RoutesService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  async estimate(@Query(new ZodPipe(priceEstimateSchema)) q: PriceEstimateInput) {
    const r = await this.db.execute<{ km: number }>(sql`
      select ST_Distance(o.geom::geography, d.geom::geography) / 1000 as km
      from districts o, districts d where o.id = ${q.from} and d.id = ${q.to}
    `);
    const row = r.rows[0];
    if (!row) throw new NotFoundException("İlçe bulunamadı");
    const road = await this.routes.roadKm(q.from, q.to);
    const p = await this.settings.price(); // FR-54: yönetici panelindeki katsayılar
    if (road !== null) return { ...roadEstimate(road, q.vehicleType, p), source: "karayolu" as const, approximate: true };
    return { ...corridorEstimate(Number(row.km), q.vehicleType, p), source: "kus_ucusu" as const, approximate: true };
  }
}
