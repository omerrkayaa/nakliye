/**
 * Demo verisi: mobil uygulamayı telefonda denemek için koridorda (Aydın–İzmir–Manisa–İstanbul) gerçekçi ilanlar.
 * - Demo nakliyeci: DEMO_PHONE (.env; giriş kodu DEMO_OTP), rolü nakliyeci, bir tırı var.
 * - 3 örnek yük sahibi (uydurma firma adları) ve bugünden itibaren 5 gün içine yayılmış teyitli ilanlar.
 *
 * Tekrar çalıştırılabilir: önceki demo ilanlarından açık kalanlar iptal edilir, yenileri yazılır (son teyit = şimdi).
 * Teyit zamanlayıcısı açıksa ilanlar ~40 saat sonra düşer (soruya cevap veren yok); demodan önce yeniden çalıştırın.
 *
 * Çalıştırma (apps/api içinden): npm run db:seed-demo
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { nextReminderAt, trDay, trDayStart } from "@nakliye/shared";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // .env yoksa ortam değişkenleri kullanılır
}
const DEMO_PHONE = process.env.DEMO_PHONE;
if (!DEMO_PHONE) throw new Error(".env'de DEMO_PHONE tanımlı değil (ör. DEMO_PHONE=+905550102030)");

const SHIPPERS = [
  { phone: "+905550102031", name: "Selin Aydın", company: "Örnek Tekstil Ltd. Şti.", level: 1 },
  { phone: "+905550102032", name: "Murat Kaya", company: "Örnek Gıda A.Ş.", level: 1 },
  { phone: "+905550102033", name: "Hakan Demir", company: null, level: 0 },
];

// [yük sahibi sırası, kalkış ilçesi, varış ilçesi, kaç gün sonra, aralık (gün), yük, ton, araç, kasa, fiyat (null = teklif), not]
type Row = [number, number, number, number, number, string, number, string, string | null, number | null, string | null];
const LOADS: Row[] = [
  [0, 914, 3418, 0, 1, "palet", 22, "tir", "tenteli", 24000, "Nazilli fabrikadan 33 palet hazır giyim. Yükleme 08:00'de."],
  [0, 905, 3405, 1, 0, "genel", 18, "tir", "tenteli", null, "Forkliftle yükleme, rampa var."],
  [1, 4516, 3408, 0, 0, "gida", 20, "tir", "frigo", 27500, "+4 °C, soğuk zincir belgesi istenir."],
  [1, 3529, 4510, 2, 1, "gida", 8, "kamyon", "kapali", 6500, null],
  [2, 3518, 3428, 1, 2, "insaat", 25, "tir", "acik", null, "Seramik, paletli. Boşaltma şantiyede."],
  [2, 4502, 905, 3, 0, "tarim", 12, "kamyon", "acik", 9000, "Zeytin kasası."],
  [0, 915, 3521, 4, 1, "palet", 6, "kamyonet", "kapali", 4500, null],
  [1, 3402, 3507, 2, 0, "makine", 14, "tir", "lowbed", null, "Tek parça makine, 3 m genişlik."],
];

const shareId = () => randomBytes(8).toString("base64url").slice(0, 10);

async function upsertUser(c: pg.Client, phone: string, name: string, level: number) {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO users (phone, name, verification_level) VALUES ($1, $2, $3)
     ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, verification_level = EXCLUDED.verification_level
     RETURNING id`,
    [phone, name, level],
  );
  return rows[0]!.id;
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? "postgres://nakliye:nakliye@localhost:5432/nakliye",
});
await client.connect();
try {
  await client.query("BEGIN");
  const now = new Date();

  // Demo nakliyeci + aracı
  const carrierId = await upsertUser(client, DEMO_PHONE, "Demo Nakliyeci", 0);
  await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'carrier') ON CONFLICT DO NOTHING`, [carrierId]);
  const { rowCount: hasVehicle } = await client.query(`SELECT 1 FROM vehicles WHERE owner_user_id = $1 AND status = 'aktif'`, [carrierId]);
  if (!hasVehicle) {
    await client.query(
      `INSERT INTO vehicles (owner_user_id, plate, vehicle_type, body_type, capacity_ton) VALUES ($1, '09DM0102', 'tir', 'tenteli', 25)`,
      [carrierId],
    );
  }

  // Yük sahipleri
  const shipperIds: string[] = [];
  for (const s of SHIPPERS) {
    const id = await upsertUser(client, s.phone, s.name, s.level);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'shipper') ON CONFLICT DO NOTHING`, [id]);
    if (s.company) {
      await client.query(
        `INSERT INTO companies (owner_user_id, title, verified_at) VALUES ($1, $2, now())
         ON CONFLICT (owner_user_id) DO UPDATE SET title = EXCLUDED.title`,
        [id, s.company],
      );
    }
    shipperIds.push(id);
  }

  // Önceki demo ilanlarından açık kalanlar
  const { rowCount: cancelled } = await client.query(
    `UPDATE load_posts SET status = 'iptal' WHERE shipper_id = ANY($1) AND status IN ('teyitli', 'teyit_bekliyor', 'suresi_doldu')`,
    [shipperIds],
  );

  const today = trDayStart(trDay(now));
  const day = (offset: number) => trDay(new Date(today.getTime() + offset * 86_400_000 + 3_600_000));
  for (const [s, origin, dest, offset, span, cargo, ton, vehicle, body, price, note] of LOADS) {
    const loadFrom = day(offset);
    await client.query(
      `INSERT INTO load_posts (share_id, shipper_id, origin_district_id, origin_geom, dest_district_id, dest_geom,
         load_from, load_to, cargo_type, weight_ton, vehicle_type, body_type, price_type, price, note,
         status, last_confirmed_at, next_reminder_at)
       SELECT $1, $2, o.id, o.geom, d.id, d.geom, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'teyitli', $14, $15
       FROM districts o, districts d WHERE o.id = $3 AND d.id = $4`,
      [
        shareId(), shipperIds[s], origin, dest, loadFrom, day(offset + span), cargo, ton, vehicle, body,
        price === null ? "teklif" : "sabit", price, note, now, nextReminderAt(now, trDayStart(loadFrom)),
      ],
    );
  }
  await client.query("COMMIT");
  console.log(`Demo hazır: nakliyeci ${DEMO_PHONE}, ${LOADS.length} ilan yazıldı, ${cancelled} eski demo ilanı iptal edildi.`);
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
