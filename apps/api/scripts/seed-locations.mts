/**
 * src/db/seed/locations.json → provinces, districts tabloları.
 * Tekrar çalıştırılabilir: aynı kimlikli kayıt varsa günceller (upsert), tek transaction içinde.
 *
 * Çalıştırma (apps/api içinden): npm run db:seed
 */
import { readFileSync } from "node:fs";
import pg from "pg";

type Loc = { id: number; name: string; lat: number; lon: number };
type Data = { provinces: Loc[]; districts: (Loc & { provinceId: number })[] };

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // .env yoksa ortam değişkenleri / varsayılan kullanılır
}
const data: Data = JSON.parse(readFileSync(new URL("../src/db/seed/locations.json", import.meta.url), "utf8"));
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? "postgres://nakliye:nakliye@localhost:5432/nakliye",
});

await client.connect();
try {
  await client.query("BEGIN");
  const p = data.provinces;
  await client.query(
    `INSERT INTO provinces (id, name, geom)
     SELECT id, name, ST_SetSRID(ST_MakePoint(lon, lat), 4326)
     FROM unnest($1::smallint[], $2::text[], $3::float8[], $4::float8[]) AS t(id, name, lat, lon)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, geom = EXCLUDED.geom`,
    [p.map((x) => x.id), p.map((x) => x.name), p.map((x) => x.lat), p.map((x) => x.lon)],
  );
  const d = data.districts;
  await client.query(
    `INSERT INTO districts (id, province_id, name, geom)
     SELECT id, province_id, name, ST_SetSRID(ST_MakePoint(lon, lat), 4326)
     FROM unnest($1::int[], $2::smallint[], $3::text[], $4::float8[], $5::float8[]) AS t(id, province_id, name, lat, lon)
     ON CONFLICT (id) DO UPDATE SET province_id = EXCLUDED.province_id, name = EXCLUDED.name, geom = EXCLUDED.geom`,
    [d.map((x) => x.id), d.map((x) => x.provinceId), d.map((x) => x.name), d.map((x) => x.lat), d.map((x) => x.lon)],
  );
  await client.query("COMMIT");

  const { rows } = await client.query(
    "SELECT (SELECT count(*) FROM provinces)::int AS provinces, (SELECT count(*) FROM districts)::int AS districts",
  );
  console.log(`Seed tamam: ${rows[0].provinces} il, ${rows[0].districts} ilçe`);
  if (rows[0].provinces !== p.length || rows[0].districts !== d.length) {
    console.warn(`UYARI: tabloda veri dosyasında olmayan kayıt var (dosya: ${p.length} il, ${d.length} ilçe)`);
  }
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
