import { Global, Inject, Injectable, Logger, Module, type OnModuleDestroy } from "@nestjs/common";
import { and, desc, gte, lt, sql } from "drizzle-orm";
import { DB, type Db } from "../db/db.module.js";
import { apiRequestStats } from "../db/schema.js";

/** Süre dilimlerinin üst sınırları (ms); son dilim > 3000. p95 bu dilimlerden yaklaşık (dilimin üst sınırı) hesaplanır. */
export const LATENCY_BOUNDS = [50, 100, 200, 300, 500, 1000, 3000] as const;
const BUCKET_COLS = ["b50", "b100", "b200", "b300", "b500", "b1000", "b3000", "bInf"] as const;
const FLUSH_MS = 60_000;
const UNKNOWN_ROUTE = "(eşleşmeyen yol)";
// Sütun varchar(8); Node MKCALENDAR gibi uzun yöntemleri de kabul ediyor — bot isteği tüm toplu yazımı düşürmesin
const KNOWN_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

interface Agg {
  hour: Date;
  method: string;
  route: string;
  requests: number;
  s4xx: number;
  s5xx: number;
  totalMs: number;
  maxMs: number;
  buckets: number[];
}

/**
 * NFR-09 gözlemlenebilirlik: API istekleri yöntem + rota kalıbı ("GET /loads/:id") + saat başına bellekte toplanır,
 * dakikada bir (ve metrik okunurken) DB'ye eklenir — istek başına satır yazılmaz. Hata oranı = 5xx / istek; 4xx ayrı
 * (çoğu olağan: süresi dolan oturum, olmayan kayıt). Eşleşmeyen yollar tek kovada (tarayıcı botlar rota sayısını
 * şişirmesin). 90 günden eskiler zamanlayıcıda silinir.
 */
@Injectable()
export class ApiStatsService implements OnModuleDestroy {
  private readonly log = new Logger(ApiStatsService.name);
  private pending = new Map<string, Agg>();
  private readonly timer = setInterval(() => void this.flush().catch((e: Error) => this.log.warn(`İstek istatistiği yazılamadı: ${e.message}`)), FLUSH_MS);

  constructor(@Inject(DB) private readonly db: Db) {
    this.timer.unref();
  }

  record(method: string, routePath: string | undefined, status: number, ms: number, now = new Date()) {
    const route = routePath ? (routePath.replace(/^\/api\/v1/, "") || "/").slice(0, 160) : UNKNOWN_ROUTE;
    if (!KNOWN_METHODS.has(method)) method = "DİĞER";
    const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
    const key = `${hour.getTime()}|${method}|${route}`;
    let a = this.pending.get(key);
    if (!a) this.pending.set(key, (a = { hour, method, route, requests: 0, s4xx: 0, s5xx: 0, totalMs: 0, maxMs: 0, buckets: Array<number>(BUCKET_COLS.length).fill(0) }));
    a.requests++;
    if (status >= 500) a.s5xx++;
    else if (status >= 400) a.s4xx++;
    a.totalMs += ms;
    a.maxMs = Math.max(a.maxMs, ms);
    const i = LATENCY_BOUNDS.findIndex((b) => ms <= b);
    a.buckets[i === -1 ? BUCKET_COLS.length - 1 : i]!++;
  }

  /** Bekleyen kovalar DB'ye eklenir (aynı saat + rota varsa sayılar toplanır) */
  async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    const batch = [...this.pending.values()];
    this.pending = new Map();
    try {
      await this.insert(batch);
    } catch (e) {
      // Yazılamadıysa (ör. DB kesintisi — 5xx'lerin en çok olduğu an) sayılar kaybolmasın: sonraki turda yeniden denenir
      for (const a of batch) this.merge(a);
      throw e;
    }
  }

  private merge(a: Agg) {
    const key = `${a.hour.getTime()}|${a.method}|${a.route}`;
    const b = this.pending.get(key);
    if (!b) return void this.pending.set(key, a);
    b.requests += a.requests;
    b.s4xx += a.s4xx;
    b.s5xx += a.s5xx;
    b.totalMs += a.totalMs;
    b.maxMs = Math.max(b.maxMs, a.maxMs);
    a.buckets.forEach((n, i) => (b.buckets[i]! += n));
  }

  private async insert(batch: Agg[]) {
    const t = apiRequestStats;
    await this.db
      .insert(t)
      .values(batch.map((a) => ({ hour: a.hour, method: a.method, route: a.route, requests: a.requests, status4xx: a.s4xx, status5xx: a.s5xx, totalMs: Math.round(a.totalMs), maxMs: Math.round(a.maxMs), ...Object.fromEntries(BUCKET_COLS.map((c, i) => [c, a.buckets[i]!])) })))
      .onConflictDoUpdate({
        target: [t.hour, t.method, t.route],
        set: {
          requests: sql`${t.requests} + excluded.requests`,
          status4xx: sql`${t.status4xx} + excluded.status_4xx`,
          status5xx: sql`${t.status5xx} + excluded.status_5xx`,
          totalMs: sql`${t.totalMs} + excluded.total_ms`,
          maxMs: sql`greatest(${t.maxMs}, excluded.max_ms)`,
          ...Object.fromEntries(BUCKET_COLS.map((c) => [c, sql`${t[c]} + excluded.${sql.raw(c === "bInf" ? "b_inf" : c)}`])),
        },
      });
  }

  /** Son N saatin özeti ve rota bazında en çok hata veren / en yavaş rotalar (en az 20 istek) */
  async summary(hours: number, now = new Date()) {
    // Yazılamasa da (sayılar bellekte bekler) panel DB'deki özetle açılsın
    await this.flush().catch((e: Error) => this.log.warn(`İstek istatistiği yazılamadı: ${e.message}`));
    const t = apiRequestStats;
    const since = new Date(now.getTime() - hours * 3_600_000);
    const sums = {
      requests: sql<number>`coalesce(sum(${t.requests}), 0)::int`,
      s4xx: sql<number>`coalesce(sum(${t.status4xx}), 0)::int`,
      s5xx: sql<number>`coalesce(sum(${t.status5xx}), 0)::int`,
      totalMs: sql<number>`coalesce(sum(${t.totalMs}), 0)::float8`,
      maxMs: sql<number>`coalesce(max(${t.maxMs}), 0)::int`,
      ...Object.fromEntries(BUCKET_COLS.map((c) => [c, sql<number>`coalesce(sum(${t[c]}), 0)::int`])),
    } as const;
    const where = and(gte(t.hour, since), sql`${t.route} not like '/health%'`);
    const [all] = await this.db.select(sums).from(t).where(where);
    const routes = await this.db.select({ method: t.method, route: t.route, ...sums }).from(t).where(where).groupBy(t.method, t.route).orderBy(desc(sql`sum(${t.status5xx})`), desc(sql`sum(${t.requests})`));
    const view = (r: typeof all & Record<string, number>) => ({
      requests: r.requests,
      status4xx: r.s4xx,
      status5xx: r.s5xx,
      errorRate: r.requests ? r.s5xx / r.requests : null,
      clientErrorRate: r.requests ? r.s4xx / r.requests : null,
      meanMs: r.requests ? Math.round(r.totalMs / r.requests) : null,
      p95Ms: p95(BUCKET_COLS.map((c) => r[c] ?? 0)),
      maxMs: r.maxMs,
    });
    const perRoute = routes.map((r) => ({ method: r.method, route: r.route, ...view(r as never) }));
    return {
      hours,
      ...view(all as never),
      topErrors: perRoute.filter((r) => r.status5xx > 0).slice(0, 5),
      // p95 null = son dilim (> 3000 ms), yani en yavaş
      slowest: perRoute.filter((r) => r.requests >= 20).sort((a, b) => (b.p95Ms ?? Number.MAX_SAFE_INTEGER) - (a.p95Ms ?? Number.MAX_SAFE_INTEGER)).slice(0, 5),
    };
  }

  async purge(now = new Date()): Promise<number> {
    const r = await this.db.delete(apiRequestStats).where(lt(apiRequestStats.hour, new Date(now.getTime() - 90 * 86_400_000))).returning({ hour: apiRequestStats.hour });
    return r.length;
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.flush().catch(() => undefined);
  }
}

/** Dilim sayılarından yaklaşık p95: isteklerin %95'inin içinde kaldığı ilk dilimin üst sınırı (son dilimde null: > 3000) */
function p95(buckets: number[]): number | null {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let seen = 0;
  for (let i = 0; i < buckets.length; i++) {
    seen += buckets[i]!;
    if (seen >= 0.95 * total) return i < LATENCY_BOUNDS.length ? LATENCY_BOUNDS[i]! : null;
  }
  return null;
}

@Global()
@Module({ providers: [ApiStatsService], exports: [ApiStatsService] })
export class ApiStatsModule {}
