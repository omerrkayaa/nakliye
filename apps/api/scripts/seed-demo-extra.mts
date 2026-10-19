/**
 * Görüşme demosu için ek veri (docs/07-demo-senaryosu.md), seed-demo.mts'nin üstüne:
 * - Üç nakliyeci daha (geçmiş işleri ve puanları farklı) ve Demo Nakliyeci'ye geçmiş: teklif karşılaştırması anlamlı olsun.
 * - Selin Aydın'ın teklif usulü Efeler → Bağcılar ilanına üç bekleyen teklif (+ bildirimleri).
 * - Demo Nakliyeci'nin yolda olan işi (Efeler → Tuzla, dün yüklendi; teslim kodu DELIVERY_CODE) ve dönüş yönünde
 *   yükler: Dönüş Planı sekmesi dolu açılsın.
 * - Koridorda birkaç ilan daha; son teyit zamanları dağıtılır (hepsi "az önce" görünmesin).
 * Sonunda herkesin güven skoru ve doğrulama seviyesi uygulamanın kuralıyla (TrustService.recompute'un aynısı) yazılır.
 *
 * Yalnız `npm run demo:reset` çağırır: yeni kurulmuş nakliye_demo veritabanını varsayar, tekrar çalıştırılabilir değildir.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { nextReminderAt, trDay, trDayStart, trustScore, verificationLevel, type DocumentType } from "@nakliye/shared";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // .env yoksa ortam değişkenleri kullanılır
}

/** Yolda olan işin teslim kodu (senaryoda alıcı bu kodu verir) */
const DELIVERY_CODE = "418263";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date();
const today = trDayStart(trDay(now));
const day = (offset: number) => trDay(new Date(today.getTime() + offset * DAY + HOUR));
const ago = (h: number) => new Date(now.getTime() - h * HOUR);
const shareId = () => randomBytes(8).toString("base64url").slice(0, 10);
const tl = (n: number) => `${new Intl.NumberFormat("tr-TR").format(n)} ₺`;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const one = async <T,>(sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows[0] as T;

const [{ db }] = (await c.query<{ db: string }>("SELECT current_database() AS db")).rows;
if (db !== "nakliye_demo") throw new Error(`Bu betik yalnız nakliye_demo içindir (şu an: ${db})`);

const districtIds = new Map<string, number>();
async function district(place: string) {
  if (!districtIds.has(place)) {
    const [province, name] = place.split("/");
    const r = await one<{ id: number } | undefined>(
      "SELECT d.id FROM districts d JOIN provinces p ON p.id = d.province_id WHERE p.name = $1 AND d.name = $2",
      [province, name],
    );
    if (!r) throw new Error(`İlçe yok: ${place}`);
    districtIds.set(place, r.id);
  }
  return districtIds.get(place)!;
}

async function userByPhone(phone: string) {
  return (await one<{ id: string }>("SELECT id FROM users WHERE phone = $1", [phone])).id;
}

async function newUser(phone: string, name: string, role: "carrier" | "shipper", createdDaysAgo: number) {
  const { id } = await one<{ id: string }>("INSERT INTO users (phone, name, created_at) VALUES ($1, $2, $3) RETURNING id", [
    phone, name, ago(createdDaysAgo * 24),
  ]);
  await c.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [id, role]);
  return id;
}

async function company(userId: string, title: string, opts: { verified?: boolean; publicProfile?: boolean } = {}) {
  await c.query(
    `INSERT INTO companies (owner_user_id, title, verified_at, public_profile) VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_user_id) DO UPDATE SET title = EXCLUDED.title, public_profile = EXCLUDED.public_profile`,
    [userId, title, opts.verified ? ago(24 * 60) : null, opts.publicProfile ?? false],
  );
}

async function vehicle(owner: string, plate: string, capacityTon: number) {
  return (
    await one<{ id: string }>(
      "INSERT INTO vehicles (owner_user_id, plate, vehicle_type, body_type, capacity_ton) VALUES ($1, $2, 'tir', 'tenteli', $3) RETURNING id",
      [owner, plate, capacityTon],
    )
  ).id;
}

/** Onaylı belge kaydı (dosyası yok; demoda belge açılmaz, yalnız seviye hesabına girer) */
async function approvedDoc(owner: string, type: string, vehicleId: string | null = null) {
  await c.query(
    `INSERT INTO documents (owner_user_id, vehicle_id, type, file_key, content_type, size_bytes, status, reviewed_at, expires_at)
     VALUES ($1, $2, $3, 'demo/yok.pdf', 'application/pdf', 1, 'onay', $4, $5)`,
    [owner, vehicleId, type, ago(24 * 50), day(300)],
  );
}

type Load = {
  shipper: string;
  from: string;
  to: string;
  loadFrom: string;
  loadTo?: string;
  cargo: string;
  ton: number;
  body?: string | null;
  price?: number | null;
  note?: string | null;
  status?: string;
  confirmedAt: Date;
};
async function load(l: Load) {
  const loadTo = l.loadTo ?? l.loadFrom;
  const { id } = await one<{ id: string }>(
    `INSERT INTO load_posts (share_id, shipper_id, origin_district_id, origin_geom, dest_district_id, dest_geom,
       load_from, load_to, cargo_type, weight_ton, vehicle_type, body_type, price_type, price, note,
       status, last_confirmed_at, next_reminder_at, created_at)
     SELECT $1, $2, o.id, o.geom, d.id, d.geom, $5, $6, $7, $8, 'tir', $9, $10, $11, $12, $13, $14, $15, $16
     FROM districts o, districts d WHERE o.id = $3 AND d.id = $4
     RETURNING id`,
    [
      shareId(), l.shipper, await district(l.from), await district(l.to), l.loadFrom, loadTo, l.cargo, l.ton,
      l.body === undefined ? "tenteli" : l.body, l.price == null ? "teklif" : "sabit", l.price ?? null, l.note ?? null,
      l.status ?? "teyitli", l.confirmedAt, nextReminderAt(l.confirmedAt, trDayStart(l.loadFrom)), new Date(l.confirmedAt.getTime() - 2 * HOUR),
    ],
  );
  return id;
}

async function offer(loadId: string, carrierId: string, vehicleId: string, price: number, status: string, at: Date, note: string | null = null) {
  return (
    await one<{ id: string }>(
      "INSERT INTO offers (load_post_id, carrier_id, vehicle_id, price, note, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
      [loadId, carrierId, vehicleId, price, note, status, at],
    )
  ).id;
}

async function event(jobId: string, type: string, actorId: string | null, at: Date, meta: object = {}) {
  await c.query("INSERT INTO job_events (job_id, type, actor_id, meta, created_at) VALUES ($1, $2, $3, $4, $5)", [jobId, type, actorId, meta, at]);
}

const codeHash = (jobId: string, code: string) =>
  createHash("sha256").update(`delivery:${jobId}:${code}:${process.env.OTP_PEPPER ?? ""}`).digest("hex");

// Ek kullanıcılar seed-demo.mts'nin numara düzenini sürdürür (+90 555 010 20 3x)
try {
  await c.query("BEGIN");
  const demo = await userByPhone(process.env.DEMO_PHONE!);
  const demoVehicle = (await one<{ id: string }>("SELECT id FROM vehicles WHERE owner_user_id = $1", [demo])).id;
  const selin = await userByPhone("+905550102031");
  const murat = await userByPhone("+905550102032");
  const hakan = await userByPhone("+905550102033");
  // seed-demo hesapları bugün açıyor; geçmiş işlerden önce üye olmuş görünsünler (profilde "Üyelik başlangıcı")
  for (const [id, days] of [[demo, 150], [selin, 240], [murat, 210], [hakan, 90]] as const) {
    await c.query("UPDATE users SET created_at = $2 WHERE id = $1", [id, ago(days * 24)]);
  }

  // seed-demo ilanlarının son teyitleri dağıtılır (hepsi aynı anda teyit edilmiş görünmesin); yeni ilanlardan önce
  const seeded = await c.query<{ id: string; load_from: string }>(
    "SELECT id, load_from::text FROM load_posts WHERE status = 'teyitli' AND shipper_id = ANY($1) ORDER BY load_from, id",
    [[selin, murat, hakan]],
  );
  for (const [i, r] of seeded.rows.entries()) {
    const confirmed = ago(0.3 + i * 1.7);
    await c.query("UPDATE load_posts SET last_confirmed_at = $2, next_reminder_at = $3, created_at = $4 WHERE id = $1", [
      r.id, confirmed, nextReminderAt(confirmed, trDayStart(r.load_from)), new Date(confirmed.getTime() - 3 * HOUR),
    ]);
  }

  // Nakliyeciler: biri köklü ve belgeli, biri orta, biri yeni ve belgesiz (teklif karşılaştırmasının anlamı bu fark)
  const lojistik = await newUser("+905550102034", "Ahmet Yıldız", "carrier", 300);
  await company(lojistik, "Örnek Lojistik Ltd. Şti.", { publicProfile: true });
  const lojistikVehicle = await vehicle(lojistik, "35OL2024", 24);
  await approvedDoc(lojistik, "ruhsat", lojistikVehicle);
  await approvedDoc(lojistik, "k_belgesi");
  await approvedDoc(lojistik, "src");

  const tasimacilik = await newUser("+905550102035", "Mehmet Koç", "carrier", 120);
  await company(tasimacilik, "Örnek Taşımacılık");
  const tasimacilikVehicle = await vehicle(tasimacilik, "45OT0745", 25);
  await approvedDoc(tasimacilik, "ruhsat", tasimacilikVehicle);

  const kemal = await newUser("+905550102036", "Kemal Arslan", "carrier", 6);
  const kemalVehicle = await vehicle(kemal, "09KA3311", 22);

  // Demo Nakliyeci: firma adı ve herkese açık profil (görüşmede /nakliyeci/<id> gösterilebilsin); belgesi yok
  await company(demo, "Demo Nakliyat", { publicProfile: true });

  // Geçmişi olan iki yük sahibi daha (giriş yapılmaz; geçmiş işlerin ve akıştaki ilanların sahibi)
  const mobilya = await newUser("+905550102037", "Zeynep Kılıç", "shipper", 200);
  await company(mobilya, "Örnek Mobilya A.Ş.", { verified: true });
  const yapi = await newUser("+905550102038", "Emre Şahin", "shipper", 180);
  await company(yapi, "Örnek Yapı Malzemeleri", { verified: true });

  // ── Geçmiş: tamamlanmış işler ve görünür puanlar ──
  const carriers = { L: [lojistik, lojistikVehicle], T: [tasimacilik, tasimacilikVehicle], D: [demo, demoVehicle] } as const;
  const shippers = { S: selin, M: murat, H: hakan, Z: mobilya, Y: yapi } as const;
  const ROUTES = [
    ["Aydın/Nazilli", "İstanbul/Esenyurt", "palet"],
    ["Aydın/Efeler", "İstanbul/Tuzla", "genel"],
    ["Manisa/Turgutlu", "İstanbul/Başakşehir", "gida"],
    ["İzmir/Kemalpaşa", "Kocaeli/Gebze", "insaat"],
    ["İzmir/Torbalı", "İstanbul/Pendik", "palet"],
    ["Bursa/İnegöl", "İzmir/Bornova", "genel"],
    ["İstanbul/Tuzla", "Aydın/Efeler", "genel"],
    ["Kocaeli/Gebze", "Manisa/Akhisar", "insaat"],
  ] as const;
  // [nakliyeci, yük sahibi, güzergâh, kaç gün önce, fiyat, yük sahibinin verdiği yıldız (null = puanlamadı), nakliyecinin verdiği]
  const HISTORY: [keyof typeof carriers, keyof typeof shippers, number, number, number, number | null, number | null][] = [
    ["L", "Z", 0, 70, 22500, 5, 5], ["L", "Y", 3, 64, 19800, 5, 4], ["L", "S", 0, 58, 23000, 4, 5], ["L", "Z", 5, 51, 17500, 5, 5],
    ["L", "M", 2, 45, 24500, 5, 5], ["L", "Y", 7, 39, 18000, 5, null], ["L", "Z", 0, 33, 23500, 4, 5], ["L", "S", 1, 27, 22000, 5, 5],
    ["L", "Y", 3, 21, 20000, 5, 4], ["L", "Z", 4, 15, 21000, 4, 5], ["L", "M", 2, 10, 25000, null, 5], ["L", "Y", 6, 6, 19500, null, 4],
    ["T", "Z", 5, 48, 16500, 4, 5], ["T", "H", 7, 36, 17000, 5, 4], ["T", "Y", 3, 24, 19000, 3, 4], ["T", "M", 2, 12, 23500, 4, 5],
    ["D", "Z", 0, 55, 22000, 5, 5], ["D", "Y", 6, 41, 18500, 4, 4], ["D", "M", 2, 30, 24000, 5, 5], ["D", "S", 0, 18, 23000, 5, 5],
    ["D", "Z", 4, 9, 20500, null, 5],
  ];
  for (const [ck, sk, ri, daysAgo, price, toCarrier, toShipper] of HISTORY) {
    const [carrierId, vehicleId] = carriers[ck];
    const shipperId = shippers[sk];
    const [from, to, cargo] = ROUTES[ri]!;
    const loaded = new Date(today.getTime() - daysAgo * DAY + 8 * HOUR);
    const loadId = await load({
      shipper: shipperId, from, to, loadFrom: trDay(loaded), cargo, ton: 18 + (daysAgo % 7), price,
      status: "kapandi", confirmedAt: new Date(loaded.getTime() - 20 * HOUR),
    });
    const offerId = await offer(loadId, carrierId, vehicleId, price, "kabul", new Date(loaded.getTime() - 18 * HOUR));
    const jobId = randomUUID();
    const delivered = new Date(loaded.getTime() + 30 * HOUR);
    const completed = new Date(delivered.getTime() + 2 * HOUR);
    await c.query(
      `INSERT INTO jobs (id, load_post_id, offer_id, shipper_id, carrier_id, vehicle_id, agreed_price, status, delivery_code_hash,
         delivered_at, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'tamamlandi', $8, $9, $10, $11)`,
      [jobId, loadId, offerId, shipperId, carrierId, vehicleId, price, codeHash(jobId, randomBytes(4).toString("hex")), delivered, completed,
        new Date(loaded.getTime() - 17 * HOUR)],
    );
    await event(jobId, "olusturuldu", shipperId, new Date(loaded.getTime() - 17 * HOUR), { offerId, price });
    await event(jobId, "yuklendi", carrierId, loaded);
    await event(jobId, "teslim_edildi", carrierId, delivered);
    await event(jobId, "tamamlandi", shipperId, completed);
    const rated = new Date(completed.getTime() + 3 * HOUR);
    for (const [rater, ratee, stars] of [[shipperId, carrierId, toCarrier], [carrierId, shipperId, toShipper]] as const) {
      if (stars === null) continue;
      await c.query(
        "INSERT INTO ratings (job_id, rater_id, ratee_id, stars, revealed_at, created_at) VALUES ($1, $2, $3, $4, $5, $5)",
        [jobId, rater, ratee, stars, rated],
      );
    }
  }
  // Selin, Örnek Lojistik'le iki kez çalıştı: favori nakliyecisi (Nakliyecilerim)
  await c.query("INSERT INTO favorite_carriers (shipper_id, carrier_id, created_at) VALUES ($1, $2, $3)", [selin, lojistik, ago(24 * 26)]);

  // ── Demo Nakliyeci'nin yolda olan işi: Efeler → Tuzla, dün yüklendi ──
  {
    const loadId = await load({
      shipper: selin, from: "Aydın/Efeler", to: "İstanbul/Tuzla", loadFrom: day(-1), cargo: "palet", ton: 20, price: 23000,
      note: "Ev tekstili, 30 palet.", status: "kapandi", confirmedAt: ago(52),
    });
    const offerId = await offer(loadId, demo, demoVehicle, 23000, "kabul", ago(50));
    const jobId = randomUUID();
    await c.query(
      `INSERT INTO jobs (id, load_post_id, offer_id, shipper_id, carrier_id, vehicle_id, agreed_price, status, delivery_code_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 23000, 'yolda', $7, $8)`,
      [jobId, loadId, offerId, selin, demo, demoVehicle, codeHash(jobId, DELIVERY_CODE), ago(49)],
    );
    await event(jobId, "olusturuldu", selin, ago(49), { offerId, price: 23000 });
    const yesterday = new Date(today.getTime() - DAY);
    await event(jobId, "yuklendi", demo, new Date(yesterday.getTime() + 8.5 * HOUR));
    await event(jobId, "yolda", demo, new Date(yesterday.getTime() + 9.2 * HOUR));
  }

  // ── Yolda olan işin Dönüş Planı'nda görünenler (OSRM rotasıyla denendi): Pendik → Nazilli ve Gebze → Turgutlu dönüş
  //    yükü, Osmangazi → Bornova yol üstü (İnegöl rotadan 30 km'den uzak kalıyordu) ──
  await load({ shipper: selin, from: "İstanbul/Pendik", to: "Aydın/Nazilli", loadFrom: day(1), loadTo: day(2), cargo: "palet", ton: 18,
    note: "Kumaş topları, 24 palet. Nazilli fabrikaya.", confirmedAt: ago(1.3) });
  await load({ shipper: murat, from: "Kocaeli/Gebze", to: "Manisa/Turgutlu", loadFrom: day(1), cargo: "genel", ton: 20, price: 15500,
    note: "Ambalaj malzemesi.", confirmedAt: ago(3.6) });
  await load({ shipper: mobilya, from: "Bursa/Osmangazi", to: "İzmir/Bornova", loadFrom: day(2), cargo: "genel", ton: 12, body: null, price: 11000,
    note: "Paketli mobilya, istifli.", confirmedAt: ago(0.4) });

  // ── Koridorda birkaç ilan daha ──
  await load({ shipper: yapi, from: "İzmir/Menemen", to: "İstanbul/Tuzla", loadFrom: day(1), loadTo: day(3), cargo: "insaat", ton: 24, body: "acik",
    note: "Seramik karo, paletli.", confirmedAt: ago(5.2) });
  await load({ shipper: mobilya, from: "Manisa/Salihli", to: "İstanbul/Esenyurt", loadFrom: day(2), cargo: "tarim", ton: 16, price: 21000,
    confirmedAt: ago(7.8) });
  await load({ shipper: yapi, from: "Aydın/Söke", to: "İzmir/Kemalpaşa", loadFrom: day(0), cargo: "insaat", ton: 10, body: "acik", price: 5200,
    confirmedAt: ago(0.15) });

  // ── Selin'in teklif usulü Efeler → Bağcılar ilanına üç teklif ──
  const target = await one<{ id: string } | undefined>(
    "SELECT id FROM load_posts WHERE shipper_id = $1 AND origin_district_id = $2 AND dest_district_id = $3 AND status = 'teyitli'",
    [selin, await district("Aydın/Efeler"), await district("İstanbul/Bağcılar")],
  );
  if (!target) throw new Error("seed-demo'daki Efeler → Bağcılar ilanı bulunamadı");
  const OFFERS: [string, string, number, number, string | null][] = [
    [lojistik, lojistikVehicle, 23500, 3.1, "Yarın 08:00'de rampada olurum."],
    [tasimacilik, tasimacilikVehicle, 21500, 1.9, null],
    [kemal, kemalVehicle, 19000, 0.6, "Hemen müsaitim."],
  ];
  for (const [carrierId, vehicleId, price, hoursAgo, note] of OFFERS) {
    const offerId = await offer(target.id, carrierId, vehicleId, price, "beklemede", ago(hoursAgo), note);
    await c.query(
      `INSERT INTO notifications (user_id, type, title, body, data, created_at) VALUES ($1, 'offer_new', $2, $3, $4, $5)`,
      [selin, `Yeni teklif: ${tl(price)}`, "Aydın/Efeler → İstanbul/Bağcılar ilanınıza teklif geldi",
        { type: "offer", loadId: target.id, offerId }, ago(hoursAgo)],
    );
  }

  // Demo Nakliyeci'nin rota alarmı: Aydın'dan İstanbul'a (yeni ilanlarda bildirim gelir)
  await c.query(
    `INSERT INTO route_alerts (user_id, origin_district_id, origin_radius_km, dest_district_id, dest_radius_km, vehicle_type, created_at)
     VALUES ($1, $2, 50, $3, 50, 'tir', $4)`,
    [demo, await district("Aydın/Efeler"), await district("İstanbul/Bağcılar"), ago(24 * 20)],
  );

  // ── Güven skoru ve doğrulama seviyesi: TrustService.recompute ile aynı girdiler (demoda şikayet yok) ──
  const all = await c.query<{ id: string }>("SELECT id FROM users");
  for (const { id } of all.rows) {
    const r = await one<{ n: number; avg: number | null }>(
      "SELECT count(*)::int AS n, avg(stars)::float AS avg FROM ratings WHERE ratee_id = $1 AND revealed_at IS NOT NULL", [id]);
    const j = await one<{ total: number; completed: number; cancelled: number; shipped: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'tamamlandi')::int AS completed,
         count(*) FILTER (WHERE status = 'iptal' AND cancelled_by = $1)::int AS cancelled,
         count(*) FILTER (WHERE status = 'tamamlandi' AND shipper_id = $1)::int AS shipped
       FROM jobs WHERE shipper_id = $1 OR carrier_id = $1`, [id]);
    const loads = await one<{ n: number }>("SELECT count(*)::int AS n FROM load_posts WHERE shipper_id = $1", [id]);
    const roles = (await c.query<{ role: "carrier" | "shipper" | "admin" }>("SELECT role FROM user_roles WHERE user_id = $1", [id])).rows;
    const approved = (await c.query<{ type: DocumentType; vehicleId: string | null; expiresAt: string | null }>(
      `SELECT type, vehicle_id AS "vehicleId", expires_at::text AS "expiresAt" FROM documents WHERE owner_user_id = $1 AND status = 'onay'`, [id])).rows;
    const active = (await c.query<{ id: string }>("SELECT id FROM vehicles WHERE owner_user_id = $1 AND status = 'aktif'", [id])).rows;
    const co = await one<{ verified_at: Date | null } | undefined>("SELECT verified_at FROM companies WHERE owner_user_id = $1", [id]);
    const level = verificationLevel({
      roles: roles.map((x) => x.role), approved, activeVehicleIds: active.map((v) => v.id), companyVerified: !!co?.verified_at,
      completedShipperJobs: j.shipped, today: trDay(now),
    });
    const score = trustScore({
      avgStars: r.avg, ratingCount: r.n, completedJobs: j.completed, verificationLevel: level,
      cancelRate: j.total > 0 ? j.cancelled / j.total : 0, reportRate: 0 / Math.max(1, loads.n + j.total),
    });
    await c.query("UPDATE users SET trust_score = $2, verification_level = $3 WHERE id = $1", [id, score, level]);
  }
  await c.query("COMMIT");
  console.log(`Ek demo verisi: ${HISTORY.length} geçmiş iş, 3 teklif, 1 yolda iş (teslim kodu ${DELIVERY_CODE}), 6 ilan daha.`);
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  await c.end();
}
