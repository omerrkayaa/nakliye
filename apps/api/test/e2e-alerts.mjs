// Rota alarmı (FR-22, UC-06) uçtan uca test.
// Yalıtım: Artvin–Rize kıyısı → Kars/Ardahan bölgesini kendine ayırır (diğer testler kullanmaz). Başta ve sonda
// bu testin kullanıcılarının (+90557…) alarmlarını kapatır, ilanlarını iptal eder.
// Mesafeler (ilçe merkezleri, PostGIS): Hopa–Arhavi 13,4 · Hopa–Fındıklı 29,8 · Hopa–Ardeşen 45,1 · Hopa–Pazar 53,4 ·
// Kars–Selim 30,3 km. Sınır durumları bu gerçek mesafelerle kurulur.
// Ön koşul ve kullanım: e2e-confirmation.mjs ile aynı (JOBS_ENABLED=false). node test/e2e-alerts.mjs api.log
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
async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(150); }
}

const cleanup = () => {
  psql(`update route_alerts set active=false where user_id in (select id from users where phone like '+90557%')`);
  psql(`update load_posts set status='iptal' where status in ('teyitli','teyit_bekliyor','moderasyonda') and shipper_id in (select id from users where phone like '+90557%')`);
  psql(`update capacity_posts set status='iptal' where status='aktif' and carrier_id in (select id from users where phone like '+90557%')`);
};
cleanup();

const trDay = (offset = 0) => new Date(Date.now() + 3 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
const run = Date.now().toString().slice(-4);
const phone = (n) => `+90557${run}${String(n).padStart(3, "0")}`;

const S = await user(phone(1), ["shipper"]);
const C1 = await user(phone(2), ["carrier"]);
const C2 = await user(phone(3), ["carrier"]);
const C3 = await user(phone(4), ["carrier"]);
const C4 = await user(phone(5), ["carrier"]);
const SC = await user(phone(6), ["shipper", "carrier"]);
const aLogin = await login(phone(9));
psql(`insert into user_roles(user_id, role) select id, 'admin' from users where phone='${phone(9)}' on conflict do nothing`);
const A = (await api("POST", "/auth/refresh", null, { refreshToken: aLogin.refreshToken })).body.accessToken;

const locs = (await api("GET", "/locations")).body;
const district = (prov, name) => locs.find((p) => p.name === prov).districts.find((d) => d.name === name).id;
const HOPA = district("Artvin", "Hopa"), ARHAVI = district("Artvin", "Arhavi"), FINDIKLI = district("Rize", "Fındıklı");
const ARDESEN = district("Rize", "Ardeşen"), PAZAR = district("Rize", "Pazar"), RIZE = district("Rize", "Merkez");
const KARS = district("Kars", "Merkez"), SELIM = district("Kars", "Selim"), ARDAHAN = district("Ardahan", "Merkez");

const alert = (t, body) => api("POST", "/alerts", t, body);
/** Yük ilanı; moderasyondaysa onaylanır ve eşleştirmenin bitmesi beklenir. */
async function load(t, from, to, vehicleType = "tir", { approve = true } = {}) {
  const r = await api("POST", "/loads", t, {
    originDistrictId: from, destDistrictId: to, loadFrom: trDay(1), loadTo: trDay(2), cargoType: "genel",
    weightTon: 10, vehicleType, bodyType: null, priceType: "teklif", price: null,
  });
  const id = r.body.id;
  if (r.body.status === "moderasyonda" && approve) await api("POST", `/admin/loads/${id}/review`, A, { decision: "onay" });
  if (r.body.status !== "moderasyonda" || approve) await until(async () => psql(`select matched_at is not null from load_posts where id='${id}'`) === "t");
  return id;
}
const notesFor = async (t, loadId) => (await api("GET", "/notifications", t)).body.items.filter((n) => n.data?.loadId === loadId);
const alertNotes = async (t) => (await api("GET", "/notifications", t)).body.items.filter((n) => n.type === "route_alert");

// ── Alarm yönetimi ────────────────────────────────────────────────
console.log("\nAlarm yönetimi (A8)");
check("yük sahibi alarm kuramaz 403", (await alert(S, { originDistrictId: HOPA })).status === 403);
check("bilinmeyen ilçe 400", (await alert(C1, { originDistrictId: 99999 })).status === 400);
check("yarıçap 10 km'den küçük 400", (await alert(C1, { originDistrictId: HOPA, originRadiusKm: 5 })).status === 400);
let r = await alert(C1, { originDistrictId: HOPA, destDistrictId: KARS, vehicleType: "tir" });
const A1 = r.body.id;
check("alarm kuruldu: varsayılan 50 / 80 km", r.status === 201 && r.body.originRadiusKm === 50 && r.body.destRadiusKm === 80 && r.body.active === true, JSON.stringify(r.body));
check("ilçe ve il adlarıyla döner", r.body.origin?.district === "Hopa" && r.body.origin.province === "Artvin" && r.body.dest?.province === "Kars");
r = await alert(C2, { originDistrictId: HOPA, originRadiusKm: 30 });
const A2 = r.body.id;
check("varış boş = her yer", r.status === 201 && r.body.dest === null && r.body.vehicleType === null);
r = await api("GET", "/alerts", C1);
check("nakliyeci kendi alarmlarını görür", r.body.items?.length === 1 && r.body.items[0].id === A1 && r.body.maxActive === 10);
check("başkasının alarmı değiştirilemez 404", (await api("PATCH", `/alerts/${A1}`, C2, { active: false })).status === 404);
check("başkasının alarmı silinemez 404", (await api("DELETE", `/alerts/${A1}`, C2)).status === 404);
check("boş güncelleme 400", (await api("PATCH", `/alerts/${A1}`, C1, {})).status === 400);

console.log("\nAktif alarm sınırı (10)");
const many = [];
for (let i = 0; i < 10; i++) many.push((await alert(C4, { originDistrictId: KARS, originRadiusKm: 10 + i })).body.id);
check("11. aktif alarm 409", (await alert(C4, { originDistrictId: KARS })).status === 409);
await api("PATCH", `/alerts/${many[0]}`, C4, { active: false });
const extra = (await alert(C4, { originDistrictId: KARS })).body.id;
check("biri kapatılınca yenisi kurulur", !!extra);
check("kapalı alarmı açmak sınırı aşarsa 409", (await api("PATCH", `/alerts/${many[0]}`, C4, { active: true })).status === 409);
check("silme 204", (await api("DELETE", `/alerts/${extra}`, C4)).status === 204);
check("silinen alarm listede yok, tekrar silme 404",
  !(await api("GET", "/alerts", C4)).body.items.some((a) => a.id === extra) && (await api("DELETE", `/alerts/${extra}`, C4)).status === 404);
psql(`update route_alerts set active=false where user_id=(select id from users where phone='${phone(5)}')`);

// ── Bildirim ──────────────────────────────────────────────────────
console.log("\nBildirim (FR-22)");
// S seviye 0: ilk 3 ilanı moderasyona düşer (BR-11)
const L1 = await load(S, FINDIKLI, SELIM, "tir", { approve: false });
await sleep(800);
check("moderasyondaki ilan için bildirim yok", (await notesFor(C1, L1)).length === 0);
await api("POST", `/admin/loads/${L1}/review`, A, { decision: "onay" });
check("onaylanınca alarm sahibine bildirim (29,8 km → Kars ±80)", await until(async () => (await notesFor(C1, L1)).length === 1));
const n1 = (await notesFor(C1, L1))[0];
check("bildirim içeriği: tip, alarm, güzergâh", n1?.type === "route_alert" && n1.data.alertId === A1 && n1.body.includes("Fındıklı"), JSON.stringify(n1));
check("30 km'lik alarm 29,8 km'deki yükü yakalar (C2)", (await notesFor(C2, L1)).length === 1);

const L2 = await load(S, PAZAR, KARS);
check("kalkış yarıçap dışında (53,4 > 50) bildirim yok", (await notesFor(C1, L2)).length === 0);
const L3 = await load(S, FINDIKLI, KARS, "kamyon");
check("araç tipi uymuyor: bildirim yok", (await notesFor(C1, L3)).length === 0);
check("araç tipi seçmeyen alarm her tipi yakalar", (await notesFor(C2, L3)).length === 1);
const L4 = await load(S, FINDIKLI, RIZE);
check("varış yarıçap dışında: bildirim yok", (await notesFor(C1, L4)).length === 0);

await api("PATCH", `/alerts/${A2}`, C2, { originRadiusKm: 45 });
const L5 = await load(S, ARDESEN, ARDAHAN);
check("45 km'lik alarm 45,1 km'deki yükü yakalamaz", (await notesFor(C2, L5)).length === 0);

await api("PATCH", `/alerts/${A1}`, C1, { active: false });
const L6 = await load(S, FINDIKLI, SELIM);
check("kapalı alarm bildirim üretmez", (await notesFor(C1, L6)).length === 0);
await api("PATCH", `/alerts/${A1}`, C1, { active: true });

console.log("\nTekilleştirme");
check("ikinci alarm kuruldu (A1 ile aynı yüke uyar)", (await alert(C1, { originDistrictId: ARHAVI, originRadiusKm: 40 })).status === 201);
const L7 = await load(S, FINDIKLI, SELIM);
check("iki alarmı uyan yük için tek bildirim", (await until(async () => (await notesFor(C1, L7)).length >= 1)) && (await notesFor(C1, L7)).length === 1);
const V3 = (await api("POST", "/vehicles", C3, { plate: `08 AL ${run}`, vehicleType: "tir", bodyType: "tenteli", capacityTon: 25 })).body.id;
await api("POST", "/capacity", C3, { vehicleId: V3, originDistrictId: HOPA, destDistrictId: null, availableFrom: trDay(0), availableTo: trDay(3) });
check("boş araç ilanı olan nakliyeci alarm kurdu", (await alert(C3, { originDistrictId: HOPA })).status === 201);
const L8 = await load(S, ARHAVI, KARS);
r = await notesFor(C3, L8);
check("boş araç eşleşmesi + alarm: tek bildirim (eşleşme önce)", r.length === 1 && r[0].type === "match_for_carrier", JSON.stringify(r.map((n) => n.type)));
check("iki rollü kullanıcı alarm kurdu", (await alert(SC, { originDistrictId: HOPA })).status === 201);
const L9 = await load(SC, ARHAVI, KARS);
check("kendi ilanı için alarm bildirimi gitmez", !(await notesFor(SC, L9)).some((n) => n.type === "route_alert"));

console.log("\nSaatlik sınır (BR-22)");
// C2'nin alarmına (Hopa ±30, sonra ±45; her yer, her tip) uyan yükler sırayla: L1, L3, L4, L6, L7, L8, L9 → 7 yük
const got = (await alertNotes(C2)).map((n) => n.data.loadId);
check("7 uygun yükten ilk 5'i bildirildi, sonrası saatlik sınıra takıldı",
  got.length === 5 && [L1, L3, L4, L6, L7].every((id) => got.includes(id)) && !got.includes(L8) && !got.includes(L9), JSON.stringify(got));

cleanup();
console.log(`\nSonuç: ${pass} geçti, ${fail} kaldı`);
process.exitCode = fail ? 1 : 0;
