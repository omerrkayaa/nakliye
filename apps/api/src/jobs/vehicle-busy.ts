import { shortDay, VEHICLE_BUSY_JOB_STATUSES } from "@nakliye/shared";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db, Tx } from "../db/db.module.js";
import { jobs, loadPosts } from "../db/schema.js";

/**
 * Araç verilen tarihlerde (iki uç dahil) teslim edilmemiş bir işte mi? Çakışan işin yükleme tarihlerini döner, yoksa null.
 * Çifte rezervasyonu önler: aynı araç iki yük sahibinin teklifi kabul edilerek iki işe atanmasın.
 */
export async function vehicleBusy(tx: Tx | Db, vehicleId: string, from: string, to: string) {
  const [clash] = await tx
    .select({ from: loadPosts.loadFrom, to: loadPosts.loadTo })
    .from(jobs)
    .innerJoin(loadPosts, eq(loadPosts.id, jobs.loadPostId))
    .where(
      and(
        eq(jobs.vehicleId, vehicleId),
        inArray(jobs.status, [...VEHICLE_BUSY_JOB_STATUSES]),
        lte(loadPosts.loadFrom, to),
        gte(loadPosts.loadTo, from),
      ),
    )
    .limit(1);
  return clash ?? null;
}

export const vehicleBusyMessage = (c: { from: string; to: string }) =>
  `Bu araç ${c.from === c.to ? shortDay(c.from) : `${shortDay(c.from)} – ${shortDay(c.to)}`} tarihlerinde başka bir işte`;
