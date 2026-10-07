import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DB, type Db } from "./db/db.module.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async check() {
    let database = "ok";
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      database = "down";
    }
    return { status: "ok", database };
  }
}
