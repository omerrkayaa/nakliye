// Y5 / FR-53 yönetici metrikleri — uçtan uca test. Metrikler tüm DB üzerinden olduğu için önce/sonra farkına bakılır
// (takımlar sırayla çalışır; aynı anda başka test çalıştırmayın).
// Yalıtım: Kilis/Musabeyli → Osmaniye/Düziçi ve +90546… numaraları. Çalıştırma kimliği DB'de boş olana kadar yeniden üretilir.
// Ön koşul ve kullanım: e2e-confirmation.mjs ile aynı (JOBS_ENABLED=false). node test/e2e-metrics.mjs api.log
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const LOG = process.argv[2];
const B = "http://localhost:3000/api/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psql = (q) => execFileSync("docker", ["exec", "nakliye-db-1", "psql", "-U", "nakliye", "-d", "nakliye", "-tAc", q]).toString().trim();
const log = () => readFileSync(LOG, "utf8");

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
async function api(method, path, token, body) {
  const res = await fetch(B + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
async function login(phone) {
  await api("POST", "/auth/otp/request", null, { phone });
  await sleep(300);
  const code = [...log().matchAll(/\[SMS → (\+\d+)\] Nakliye giriş kodunuz: (\d{6})/g)].filter((m) => m[1] === phone).at(-1)[2];
  return (await api("POST", "/auth/otp/verify", null, { phone, code })).body;
}
async function user(phone, roles) {
  const t = await login(phone);
  return roles.length ? (await api("POST", "/me/roles", t.accessToken, { roles })).body.accessToken : t.accessToken;
}

const trDay = (offset = 0) => new Date(Date.now() + 3 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
/** Bu haftanın pazartesisi (Türkiye günü) */
const monday = () => {
  const d = new Date(`${trDay()}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
};
let run;
do run = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
while (psql(`select count(*) from users where phone like '+90546${run}%'`) !== "0");
const phone = (n) => `+90546${run}${String(n).padStart(3, "0")}`;

const S = await user(phone(1), ["shipper"]);
const C = await user(phone(2), ["carrier"]);
const aLogin = await login(phone(9));
psql(`insert into user_roles(user_id, role) select id, 'admin' from users where phone='${phone(9)}' on conflict do nothing`);
const A = (await api("POST", "/auth/refresh", null, { refreshToken: aLogin.refreshToken })).body.accessToken;
const locs = (await api("GET", "/locations")).body;
const district = (prov, name) => locs.find((p) => p.name === prov).districts.find((d) => d.name === name).id;
const MUSABEYLI = district("Kilis", "Musabeyli"), DUZICI = district("Osmaniye", "Düziçi");
const V = (await api("POST", "/vehicles", C, { plate: `79 MT ${run}`, vehicleType: "kamyonet", bodyType: "kapali", capacityTon: 3 })).body.id;
const metrics = async () => (await api("GET", "/admin/metrics", A)).body;
const lastOf = (arr, key) => arr.at(-1)[key];

console.log("\nYetki ve biçim");
check("yönetici olmayan 403", (await api("GET", "/admin/metrics", S)).status === 403);
const m0 = await metrics();
check("haftalık kapanan: son 8 hafta, sonuncusu bu pazartesi", m0.weeklyClosed?.length === 8 && lastOf(m0.weeklyClosed, "week") === monday(), JSON.stringify(m0.weeklyClosed?.slice(-2)));
check("günlük ilan: son 14 gün, sonuncusu bugün (TR)", m0.dailyLoads?.length === 14 && lastOf(m0.dailyLoads, "day") === trDay(), JSON.stringify(m0.dailyLoads?.slice(-2)));
check("oranlar 0–1 ya da boş", [m0.live.freshness, m0.confirmations.answerRate, m0.matches.hitRate].every((x) => x === null || (x >= 0 && x <= 1)), JSON.stringify([m0.live, m0.confirmations, m0.matches]));

console.log("\nİlan ve tazelik");
const lr = await api("POST", "/loads", S, {
  originDistrictId: MUSABEYLI, destDistrictId: DUZICI, loadFrom: trDay(1), loadTo: trDay(2), cargoType: "genel",
  weightTon: 2, vehicleType: "kamyonet", bodyType: null, priceType: "teklif", price: null,
});
const L = lr.body.id;
if (lr.body.status === "moderasyonda") await api("POST", `/admin/loads/${L}/review`, A, { decision: "onay" });
const m1 = await metrics();
check("bugünün yeni ilanı +1", lastOf(m1.dailyLoads, "loads") === lastOf(m0.dailyLoads, "loads") + 1, `${lastOf(m0.dailyLoads, "loads")} → ${lastOf(m1.dailyLoads, "loads")}`);
check("yayındaki ve taze ilan +1", m1.live.visible === m0.live.visible + 1 && m1.live.fresh === m0.live.fresh + 1, JSON.stringify([m0.live, m1.live]));

console.log("\nTeyit cevabı");
psql(`insert into load_confirmations (load_post_id, asked_at, answered_at, answer, channel) values ('${L}', now() - interval '40 minutes', now() - interval '10 minutes', 'gecerli', 'app')`);
psql(`insert into load_confirmations (load_post_id, asked_at, answer) values ('${L}', now() - interval '5 hours', 'cevapsiz')`);
const m2 = await metrics();
check("sorulan +2, cevaplanan +1, cevapsız +1", m2.confirmations.asked === m1.confirmations.asked + 2 && m2.confirmations.answered === m1.confirmations.answered + 1 && m2.confirmations.unanswered === m1.confirmations.unanswered + 1, JSON.stringify([m1.confirmations, m2.confirmations]));
check("cevap oranı = cevaplanan / (cevaplanan + cevapsız)", m2.confirmations.answerRate === Math.round((m2.confirmations.answered / (m2.confirmations.answered + m2.confirmations.unanswered)) * 1000) / 1000);
check("medyan cevap süresi dakika", typeof m2.confirmations.medianMinutes === "number" && m2.confirmations.medianMinutes >= 0);

console.log("\nEşleşme isabeti");
// Boş araç ilanı yükün tarihlerinden uzak: eşleştirme kendiliğinden eşleşme yazmasın, satırı test ekler
const K = (await api("POST", "/capacity", C, { vehicleId: V, originDistrictId: MUSABEYLI, destDistrictId: null, availableFrom: trDay(20), availableTo: trDay(21) })).body.id;
psql(`insert into matches (load_post_id, capacity_post_id, score, notified_at, outcome) values ('${L}', '${K}', 0.8, now(), 'teklif')`);
const m3 = await metrics();
check("eşleşme, bildirilen ve dönüşen +1", m3.matches.created === m2.matches.created + 1 && m3.matches.notified === m2.matches.notified + 1 && m3.matches.converted === m2.matches.converted + 1, JSON.stringify([m2.matches, m3.matches]));
check("isabet = dönüşen / bildirilen", m3.matches.hitRate === Math.round((m3.matches.converted / m3.matches.notified) * 1000) / 1000);

console.log("\nHaftalık kapanan yük (ana başarı ölçütü)");
const offer = (await api("POST", `/loads/${L}/offers`, C, { vehicleId: V, price: 2000 })).body;
const acc = (await api("POST", `/offers/${offer.id}/accept`, S)).body;
const m4 = await metrics();
check("kabul edilen iş henüz sayılmaz", lastOf(m4.weeklyClosed, "closed") === lastOf(m3.weeklyClosed, "closed"));
check("kabulde ilan kapandı: yayındaki ilan -1", m4.live.visible === m3.live.visible - 1, JSON.stringify([m3.live, m4.live]));
await api("POST", `/jobs/${acc.job.id}/deliver`, C, { code: acc.deliveryCode });
await api("POST", `/jobs/${acc.job.id}/complete`, S);
const m5 = await metrics();
check("tamamlanan iş bu haftaya +1", lastOf(m5.weeklyClosed, "closed") === lastOf(m4.weeklyClosed, "closed") + 1, `${lastOf(m4.weeklyClosed, "closed")} → ${lastOf(m5.weeklyClosed, "closed")}`);

psql(`update capacity_posts set status='iptal' where id='${K}'`);
console.log(`\nSonuç: ${pass} geçti, ${fail} kaldı`);
process.exitCode = fail ? 1 : 0;
