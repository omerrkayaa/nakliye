// FR-07 (KVKK): veri dökümü ve hesap silme (anonimleştirme); askıya almada belirtecin hemen düşmesi — uçtan uca test.
// Yalıtım: Tunceli/Ovacık → Bingöl/Karlıova ve +90541… numaraları. Çalıştırma kimliği DB'de boş olana kadar yeniden üretilir.
// Ön koşul ve kullanım: e2e-confirmation.mjs ile aynı (JOBS_ENABLED=false). node test/e2e-account.mjs api.log
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
const lastCode = (phone, kind) =>
  [...log().matchAll(new RegExp(`\\[SMS → (\\+\\d+)\\] Nakliye ${kind} kodunuz: (\\d{6})`, "g"))].filter((m) => m[1] === phone).at(-1)?.[2];
async function login(phone) {
  await api("POST", "/auth/otp/request", null, { phone });
  await sleep(300);
  return (await api("POST", "/auth/otp/verify", null, { phone, code: lastCode(phone, "giriş") })).body;
}
/** Giriş + rol; erişim (rollü) ve yenileme belirteci */
async function user(phone, roles) {
  const t = await login(phone);
  const access = roles.length ? (await api("POST", "/me/roles", t.accessToken, { roles })).body.accessToken : t.accessToken;
  return { access, refresh: t.refreshToken };
}
const trDay = (offset = 0) => new Date(Date.now() + 3 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

let run;
do run = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
while (psql(`select count(*) from users where phone like '+90541${run}%'`) !== "0");
const phone = (n) => `+90541${run}${String(n).padStart(3, "0")}`;
const idOf = (p) => psql(`select id from users where phone='${p}'`);

const S = await user(phone(1), ["shipper"]); // silinecek yük sahibi
const C = await user(phone(2), ["carrier"]);
const C2 = await user(phone(3), ["carrier"]); // silinecek nakliyeci
const S2 = await user(phone(4), ["shipper"]);
const aLogin = await login(phone(9));
psql(`insert into user_roles(user_id, role) select id, 'admin' from users where phone='${phone(9)}' on conflict do nothing`);
const A = (await api("POST", "/auth/refresh", null, { refreshToken: aLogin.refreshToken })).body.accessToken;
const Sid = idOf(phone(1)), Cid = idOf(phone(2)), C2id = idOf(phone(3));

await api("PATCH", "/me", S.access, { name: "Ovacık Ahmet" });
await api("POST", "/companies", S.access, { title: `Ovacık Gıda ${run}`, taxNo: "1234567890", taxOffice: "Tunceli", address: "Cumhuriyet Mah. 12" });
await api("PATCH", "/me", C.access, { name: "Karlıova Nakliyat" });

const locs = (await api("GET", "/locations")).body;
const district = (prov, name) => locs.find((p) => p.name === prov).districts.find((d) => d.name === name).id;
const OVACIK = district("Tunceli", "Ovacık"), KARLIOVA = district("Bingöl", "Karlıova");
const vehicle = async (t, plate) => (await api("POST", "/vehicles", t, { plate, vehicleType: "kamyon", bodyType: "kapali", capacityTon: 10 })).body.id;
const V = await vehicle(C.access, `62 AC ${run}`), V2 = await vehicle(C2.access, `62 AD ${run}`);

async function load(t, from, note = null) {
  const r = await api("POST", "/loads", t, {
    originDistrictId: OVACIK, destDistrictId: KARLIOVA, loadFrom: trDay(from), loadTo: trDay(from), cargoType: "genel",
    weightTon: 5, vehicleType: "kamyon", bodyType: null, priceType: "teklif", price: null, ...(note ? { note } : {}),
  });
  if (r.body.status === "moderasyonda") await api("POST", `/admin/loads/${r.body.id}/review`, A, { decision: "onay" });
  return r.body.id;
}
const offer = async (carrier, l, v, price = 9000, note) => (await api("POST", `/loads/${l}/offers`, carrier, { vehicleId: v, price, ...(note ? { note } : {}) })).body.id;
/** İlan → teklif → kabul → teslim → tamamlandı */
async function doneJob(shipper, carrier, v, from) {
  const l = await load(shipper, from);
  const o = await offer(carrier, l, v);
  const acc = (await api("POST", `/offers/${o}/accept`, shipper)).body;
  await api("POST", `/jobs/${acc.job.id}/deliver`, carrier, { code: acc.deliveryCode });
  await api("POST", `/jobs/${acc.job.id}/complete`, shipper);
  return acc.job.id;
}
const rate = (t, job, stars, comment) => api("POST", `/jobs/${job}/rating`, t, { stars, tags: ["zamaninda"], ...(comment ? { comment } : {}) });

// S'nin geçmişi: J0 iki taraf puanladı (görünür), J2'yi yalnız C2 puanladı (kör, gizli), J4'ü yalnız S puanladı
const J0 = await doneJob(S.access, C.access, V, 1);
await rate(S.access, J0, 5, "Ahmet Bey'den: çok iyi şoför");
await rate(C.access, J0, 4, "Ödeme zamanında");
const J2 = await doneJob(S.access, C2.access, V2, 2);
await rate(C2.access, J2, 2, "gizli kalmalı");
const J4 = await doneJob(S.access, C.access, V, 3);
await rate(S.access, J4, 5);
check("favori nakliyeci", (await api("PUT", `/me/carriers/${Cid}/favorite`, S.access)).status === 200);
// Açık ilan: C2'nin bekleyen teklifi
const L1 = await load(S.access, 5, "Arayın: 0532 000 00 00, Ahmet");
check("C2 açık ilana teklif", !!(await offer(C2.access, L1, V2, 9500, "C2 notu")));

console.log("\nVeri dökümü");
check("girişsiz 401", (await api("GET", "/me/export")).status === 401);
let r = await api("GET", "/me/export", S.access);
const ex = r.body;
check("200 ve biçim", r.status === 200 && ex.format === "nakliye-kisisel-veri/1" && !!ex.generatedAt, JSON.stringify(r.body).slice(0, 200));
check("hesap: numara, ad, rol", ex.account?.phone === phone(1) && ex.account?.name === "Ovacık Ahmet" && ex.account?.roles?.includes("shipper"));
check("firma bilgisi", ex.company?.title === `Ovacık Gıda ${run}` && ex.company?.taxNo === "1234567890");
check("ilanlar (4) ve teyit soruları dizisi", ex.loads?.length === 4 && ex.loads.every((l) => Array.isArray(l.confirmations)) && ex.loads.some((l) => l.id === L1 && l.origin.province === "Tunceli"), JSON.stringify(ex.loads?.map((l) => l.id)));
check("işler (3): rol, karşı taraf adı, zaman çizelgesi", ex.jobs?.length === 3 && ex.jobs.every((j) => j.role === "shipper" && j.events.length > 0) && ex.jobs.some((j) => j.id === J0 && j.counterpart === "Karlıova Nakliyat"));
check("gelen teklifler nakliyeci adıyla", ex.offersReceived?.length >= 4 && ex.offersReceived.some((o) => o.loadId === L1 && o.note === "C2 notu"));
check("verilen puanlar (2)", ex.ratingsGiven?.length === 2);
check("alınan puan yalnız görünür olan (J0; J2 kör)", ex.ratingsReceived?.length === 1 && ex.ratingsReceived[0].jobId === J0 && ex.ratingsReceived[0].stars === 4, JSON.stringify(ex.ratingsReceived));
check("favori nakliyeci adıyla", ex.favoriteCarriers?.length === 1 && ex.favoriteCarriers[0].carrier === "Karlıova Nakliyat");
check("oturumlar ve bildirimler", ex.sessions?.length >= 1 && ex.notifications?.length >= 1);
const exText = JSON.stringify(ex);
check("karşı tarafların numarası yok", ![phone(2), phone(3)].some((p) => exText.includes(p)));
check("özet/belirteç alanı yok", !/hash|token/i.test(Object.keys(ex).join() + exText.match(/"[a-zA-Z]+":/g).join()), "anahtar adlarında hash/token var");
const cEx = (await api("GET", "/me/export", C2.access)).body;
check("nakliyeci dökümü: araç, verilen teklif", cEx.vehicles?.some((v) => v.plate === `62AD${run}`) && cEx.offersMade?.some((o) => o.loadId === L1));

console.log("\nSilme engelleri");
// C'nin S2 ile süren işi: C silinemez
const L3 = await load(S2.access, 6);
const acc3 = (await api("POST", `/offers/${await offer(C.access, L3, V)}/accept`, S2.access)).body;
check("süren iş kuruldu", !!acc3.job?.id);
r = await api("POST", "/me/deletion-code", C.access);
check("süren taşıma varken kod gönderilmez 409", r.status === 409 && /Sonuçlanmamış 1 taşımanız var/.test(r.body.message), JSON.stringify(r.body));
check("silme de 409", (await api("DELETE", "/me", C.access, { code: "123456" })).status === 409);
r = await api("POST", "/me/deletion-code", A);
check("yönetici hesabı silinemez 409", r.status === 409 && r.body.message === "Yönetici hesabı silinemez.", JSON.stringify(r.body));
check("kodsuz 400", (await api("DELETE", "/me", S.access, {})).status === 400);
check("kısa kod 400", (await api("DELETE", "/me", S.access, { code: "12" })).status === 400);

console.log("\nYük sahibinin hesabını silme");
r = await api("POST", "/me/deletion-code", S.access);
check("silme kodu 204", r.status === 204, JSON.stringify(r.body));
await sleep(300);
const code = lastCode(phone(1), "hesap silme");
check("SMS'te silme kodu", !!code);
check("hemen yeniden kod 429", (await api("POST", "/me/deletion-code", S.access)).status === 429);
r = await api("DELETE", "/me", S.access, { code: code === "000000" ? "000001" : "000000" });
check("yanlış kod 400 (oturum hatası değil)", r.status === 400 && r.body.message === "Kod hatalı", JSON.stringify(r.body));
check("silinmeden önce hesap yerinde", psql(`select status from users where id='${Sid}'`) === "aktif");
r = await api("DELETE", "/me", S.access, { code });
check("silindi 200", r.status === 200 && r.body.deleted === true, JSON.stringify(r.body));
check("aynı kodla tekrar: erişim belirteci artık 401", (await api("DELETE", "/me", S.access, { code })).status === 401);
check("GET /me 401", (await api("GET", "/me", S.access)).status === 401);
check("oturum yenilenemez 401", (await api("POST", "/auth/refresh", null, { refreshToken: S.refresh })).status === 401);

const row = psql(`select coalesce(phone,'-')||'|'||name||'|'||status||'|'||(deleted_at is not null) from users where id='${Sid}'`);
check("numara boş, ad 'Silinmiş kullanıcı', durum silindi", row === "-|Silinmiş kullanıcı|silindi|true", row);
check("rol, firma, bildirim, favori, oturum kalmadı",
  psql(`select (select count(*) from user_roles where user_id='${Sid}')||','||(select count(*) from companies where owner_user_id='${Sid}')||','||(select count(*) from notifications where user_id='${Sid}')||','||(select count(*) from favorite_carriers where shipper_id='${Sid}')||','||(select count(*) from refresh_tokens where user_id='${Sid}')`) === "0,0,0,0,0");
check("açık ilan iptal, ilan notları silindi", psql(`select status||'|'||coalesce(note,'-') from load_posts where id='${L1}'`) === "iptal|-" && psql(`select count(*) from load_posts where shipper_id='${Sid}' and note is not null`) === "0");
check("verdiği puanın yorumu silindi, yıldız kaldı", psql(`select stars||'|'||coalesce(comment,'-') from ratings where job_id='${J0}' and rater_id='${Sid}'`) === "5|-");
check("C2'nin teklifi sonuçlanmadı (ret)", psql(`select status from offers where load_post_id='${L1}' and carrier_id='${C2id}'`) === "ret");
check("C2'ye 'sonuçlanmadı' bildirimi", (await api("GET", "/notifications", C2.access)).body.items.some((n) => n.type === "offer_result" && n.data?.loadId === L1));
r = await api("GET", `/jobs/${J0}`, C.access);
check("karşı tarafın iş geçmişi: 'Silinmiş kullanıcı', numara yok", r.status === 200 && r.body.counterpart?.displayName === "Silinmiş kullanıcı" && r.body.counterpart?.phone === null, JSON.stringify(r.body.counterpart));
check("silinen hesabın profili 404", (await api("GET", `/users/${Sid}/reputation`, C.access)).status === 404);
check("silinen hesaba yeni bildirim yazılmaz (C, J4'ü puanlar)", (await rate(C.access, J4, 3)).status === 201 && psql(`select count(*) from notifications where user_id='${Sid}'`) === "0");
r = await api("GET", `/users/${Cid}/reputation`, C2.access);
// J0 zaten görünürdü; J4 iki taraf puanlayınca açıldı: silinen hesabın verdiği iki puan da sayılır
check("karşı tarafın itibarı korunur (S'nin 2 puanı)", r.body.rating?.count === 2, JSON.stringify(r.body.rating));

const again = await login(phone(1));
const newId = idOf(phone(1));
check("aynı numarayla yeni, boş hesap", again.isNew === true && !!newId && newId !== Sid);
const fresh = (await api("GET", "/me/export", again.accessToken)).body;
check("yeni hesabın dökümü boş", fresh.loads?.length === 0 && fresh.jobs?.length === 0 && fresh.company === null);

console.log("\nNakliyecinin hesabını silme");
// S2 ile tamamlanmış iş ve favori: silinince S2'nin listesinde kalır, favorisi silinir
const J6 = await doneJob(S2.access, C2.access, V2, 11);
check("S2 C2'yi favoriye ekler", !!J6 && (await api("PUT", `/me/carriers/${C2id}/favorite`, S2.access)).status === 200);
const L5 = await load(S2.access, 7);
check("C2 başka ilana teklif", !!(await offer(C2.access, L5, V2, 8000, "Beni arayın 0555 111 22 33")));
const cap = await api("POST", "/capacity", C2.access, { vehicleId: V2, originDistrictId: KARLIOVA, destDistrictId: null, availableFrom: trDay(8), availableTo: trDay(9) });
check("C2 boş araç ilanı", cap.status === 201, JSON.stringify(cap.body));
const al = await api("POST", "/alerts", C2.access, { originDistrictId: KARLIOVA, destDistrictId: null });
check("C2 rota alarmı", al.status === 201, JSON.stringify(al.body));
await api("POST", "/me/deletion-code", C2.access);
await sleep(300);
r = await api("DELETE", "/me", C2.access, { code: lastCode(phone(3), "hesap silme") });
check("nakliyeci silindi", r.status === 200, JSON.stringify(r.body));
check("araç silindi, plaka silindi", psql(`select status||'|'||plate from vehicles where id='${V2}'`) === "silindi|—");
check("boş araç ilanı iptal", psql(`select status from capacity_posts where id='${cap.body.id}'`) === "iptal");
check("rota alarmı silindi", psql(`select count(*) from route_alerts where user_id='${C2id}'`) === "0");
check("teklif geri çekildi, notu silindi", psql(`select status||'|'||coalesce(note,'-') from offers where load_post_id='${L5}' and carrier_id='${C2id}'`) === "geri_cekildi|-");
r = await api("GET", `/loads/${L5}/offers`, S2.access);
const o5 = r.body.items?.find((o) => o.status === "geri_cekildi");
check("yük sahibinin teklif listesinde 'Silinmiş kullanıcı', numara '—'", o5?.carrier?.displayName === "Silinmiş kullanıcı" && o5?.carrier?.phoneMasked === "—", JSON.stringify(o5?.carrier));
check("C2'nin verdiği kör puan kaldı (karşı tarafın puanı)", psql(`select count(*) from ratings where rater_id='${C2id}'`) === "1");
r = await api("GET", "/me/carriers", S2.access);
const c2row = r.body.items?.find((c) => c.id === C2id);
check("Nakliyecilerim: silinmiş nakliyeci adıyla, numarasız, favori değil", c2row?.displayName === "Silinmiş kullanıcı" && c2row?.phone === null && c2row?.favorite === false, JSON.stringify(c2row));
r = await api("PUT", `/me/carriers/${C2id}/favorite`, S2.access);
check("silinmiş nakliyeci favori olamaz 404", r.status === 404 && r.body.message === "Nakliyecinin hesabı silinmiş", JSON.stringify(r.body));

console.log("\nYarıda kalan silme (zamanlayıcı tamamlar)");
const X = await user(phone(7), ["shipper"]);
const Xid = idOf(phone(7));
const LX = await load(X.access, 10);
// Silme işaretlendi ama anonimleştirme yapılmadı (çökme): 10 dk önce
psql(`update users set status='silindi', deleted_at=now() - interval '10 minutes' where id='${Xid}'`);
const Y = await user(phone(8), ["shipper"]);
const Yid = idOf(phone(8));
psql(`update users set status='silindi', deleted_at=now() where id='${Yid}'`);
await api("POST", "/auth/otp/request", null, { phone: phone(8) });
await sleep(300);
r = await api("POST", "/auth/otp/verify", null, { phone: phone(8), code: lastCode(phone(8), "giriş") });
check("silme sürerken aynı numarayla giriş 403", r.status === 403 && /Hesap silme işlemi sürüyor/.test(r.body.message), JSON.stringify(r.body));
r = await api("POST", "/admin/tick", A);
check("tur yarım silmeyi tamamladı", r.status === 200 && r.body.deletionsFinished >= 1, JSON.stringify(r.body));
check("X anonim, ilanı iptal", psql(`select coalesce(phone,'-')||'|'||name from users where id='${Xid}'`) === "-|Silinmiş kullanıcı" && psql(`select status from load_posts where id='${LX}'`) === "iptal");
check("5 dakikadan yeni olan (süren istek) beklenir", psql(`select phone is not null from users where id='${Yid}'`) === "t");
// Temizlik: Y'yi de tamamla (sonraki takımları etkilemesin)
psql(`update users set deleted_at=now() - interval '10 minutes' where id='${Yid}'`);
await api("POST", "/admin/tick", A);
check("Y de tamamlandı", psql(`select phone is null from users where id='${Yid}'`) === "t");

console.log("\nYönetici: silinmiş hesap askıya alınamaz");
r = await api("POST", `/admin/users/${C2id}/suspend`, A, { reason: "silinmiş hesabı deniyorum" });
check("409 'Hesap silinmiş'", r.status === 409 && r.body.message === "Hesap silinmiş", JSON.stringify(r.body));

console.log(`\nSonuç: ${pass} geçti, ${fail} kaldı`);
process.exitCode = fail ? 1 : 0;
