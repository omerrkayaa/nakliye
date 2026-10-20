// Görüşme/demo için temiz veritabanı: nakliye_demo'yu silip yeniden kurar (migration + il/ilçe + demo verisi).
// Testlerin kullandığı ana veritabanına (nakliye) dokunmaz; test koşuları demoyu kirletmez.
//
//   npm run demo:reset     (apps/api içinden; Docker'da db ve osrm açık olmalı)
//
// Sonra API'yi bu veritabanıyla başlatın:
//   DATABASE_URL=postgres://nakliye:nakliye@localhost:5432/nakliye_demo node dist/main.js
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_DB = "nakliye_demo";

try {
  process.loadEnvFile(join(API_DIR, ".env"));
} catch {
  // .env yoksa varsayılan adres
}
const base = new URL(process.env.DATABASE_URL ?? "postgres://nakliye:nakliye@localhost:5432/nakliye");
const demoUrl = new URL(base);
demoUrl.pathname = `/${DEMO_DB}`;
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";

const admin = new pg.Client({ connectionString: adminUrl.href });
await admin.connect();
try {
  // FORCE: açık kalan demo API bağlantıları kapatılır
  await admin.query(`DROP DATABASE IF EXISTS ${DEMO_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DEMO_DB}`);
} finally {
  await admin.end();
}

const drizzleKit = [join(API_DIR, "node_modules"), join(API_DIR, "..", "..", "node_modules")]
  .map((d) => join(d, "drizzle-kit", "bin.cjs"))
  .find(existsSync);
if (!drizzleKit) throw new Error("drizzle-kit bulunamadı (npm install)");

const env = { ...process.env, DATABASE_URL: demoUrl.href };
for (const [label, args] of [
  ["migration", [drizzleKit, "migrate"]],
  ["il/ilçe", [join("scripts", "seed-locations.mts")]],
  ["demo verisi", [join("scripts", "seed-demo.mts")]],
  ["görüşme verisi", [join("scripts", "seed-demo-extra.mts")]],
]) {
  const r = spawnSync(process.execPath, args, { cwd: API_DIR, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${label} başarısız:\n${r.stdout}\n${r.stderr}`);
  console.log(`✓ ${label}${label.endsWith("verisi") ? `: ${r.stdout.trim()}` : ""}`);
}
console.log(`\nHazır: ${demoUrl.href.replace(/:[^:@/]+@/, ":***@")}`);
