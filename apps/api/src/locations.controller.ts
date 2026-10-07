import { Controller, Get, Header, Inject } from "@nestjs/common";
import { asc } from "drizzle-orm";
import { DB, type Db } from "./db/db.module.js";
import { districts, provinces } from "./db/schema.js";

/**
 * İl/ilçe seçim listesi (ilan formu, filtreler). Veri statik: istemci bir kez indirip saklar,
 * herkese açık çünkü kayıt öncesi ekranlarda da gerekebilir.
 */
@Controller("locations")
export class LocationsController {
  private cache?: unknown;

  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Header("Cache-Control", "public, max-age=86400")
  async list() {
    if (this.cache) return this.cache;
    const ps = await this.db.select({ id: provinces.id, name: provinces.name }).from(provinces).orderBy(asc(provinces.id));
    const ds = await this.db
      .select({ id: districts.id, provinceId: districts.provinceId, name: districts.name })
      .from(districts)
      .orderBy(asc(districts.id));
    this.cache = ps.map((p) => ({
      ...p,
      districts: ds.filter((d) => d.provinceId === p.id).map(({ id, name }) => ({ id, name })),
    }));
    return this.cache;
  }
}
