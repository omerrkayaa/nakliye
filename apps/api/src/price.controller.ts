import { Controller, Get, Inject, NotFoundException, Query, UseGuards } from "@nestjs/common";
import { corridorEstimate, priceEstimateSchema, type PriceEstimateInput } from "@nakliye/shared";
import { sql } from "drizzle-orm";
import { AuthGuard } from "./auth/auth.guard.js";
import { ZodPipe } from "./common/zod.pipe.js";
import { DB, type Db } from "./db/db.module.js";

/**
 * F7 koridor fiyat aralığı (FR-25, docs/04 §7): ilçe merkezleri arası mesafe (PostGIS, metre → km) × yol katsayısı,
 * araç tipine göre maliyet ve kâr bandı. Yaklaşıktır: otoyol/köprü ücreti ve gerçek güzergâh yok.
 */
@Controller("price-estimate")
@UseGuards(AuthGuard)
export class PriceController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async estimate(@Query(new ZodPipe(priceEstimateSchema)) q: PriceEstimateInput) {
    const r = await this.db.execute<{ km: number }>(sql`
      select ST_Distance(o.geom::geography, d.geom::geography) / 1000 as km
      from districts o, districts d where o.id = ${q.from} and d.id = ${q.to}
    `);
    const row = r.rows[0];
    if (!row) throw new NotFoundException("İlçe bulunamadı");
    return { ...corridorEstimate(Number(row.km), q.vehicleType), approximate: true };
  }
}
