// FR-05/FR-50/FR-06 + BR-10: belge yükleme, imzalı dosya bağlantısı, yönetici kararı ve doğrulama seviyesi — uçtan uca test.
// Yalıtım: Hakkari/Yüksekova → Şırnak/Cizre ve +90549… numaraları. Çalıştırma kimliği DB'de boş olana kadar yeniden üretilir.
// Ön koşul ve kullanım: e2e-confirmation.mjs ile aynı (JOBS_ENABLED=false). node test/e2e-documents.mjs api.log
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
/** Çok parçalı yükleme: alanlar + (varsa) dosya */
async function upload(token, fields, bytes, name = "belge.bin", mime = "application/octet-stream") {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);
  if (bytes) fd.append("file", new Blob([bytes], { type: mime }), name);
  const res = await fetch(B + "/documents", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: fd });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
/** İmzalı yoldan dosyayı indir */
async function fetchFile(path) {
  const res = await fetch(B + path);
  return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
}
const lastCode = (phone, kind) =>
  [...log().matchAll(new RegExp(`\\[SMS → (\\+\\d+)\\] Nakliye ${kind} kodunuz: (\\d{6})`, "g"))].filter((m) => m[1] === phone).at(-1)?.[2];
async function login(phone) {
  await api("POST", "/auth/otp/request", null, { phone });
  await sleep(300);
  return (await api("POST", "/auth/otp/verify", null, { phone, code: lastCode(phone, "giriş") })).body;
}
async function user(phone, roles) {
  const t = await login(phone);
  return roles.length ? (await api("POST", "/me/roles", t.accessToken, { roles })).body.accessToken : t.accessToken;
}
const trDay = (offset = 0) => new Date(Date.now() + 3 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

let run;
do run = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
while (psql(`select count(*) from users where phone like '+90549${run}%'`) !== "0");
const phone = (n) => `+90549${run}${String(n).padStart(3, "0")}`;
const idOf = (p) => psql(`select id from users where phone='${p}'`);
const level = (id) => psql(`select verification_level from users where id='${id}'`);

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`png-${run}`)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`jpg-${run}`)]);
const PDF = Buffer.from(`%PDF-1.4\n% deneme ${run}\n`);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

const C = await user(phone(1), ["carrier"]);
const Cid = idOf(phone(1));
const S = await user(phone(2), ["shipper"]);
const Sid = idOf(phone(2));
const O = await user(phone(3), ["carrier"]); // başka nakliyeci
const aLogin = await login(phone(9));
psql(`insert into user_roles(user_id, role) select id, 'admin' from users where phone='${phone(9)}' on conflict do nothing`);
const A = (await api("POST", "/auth/refresh", null, { refreshToken: aLogin.refreshToken })).body.accessToken;
const vehicle = async (t, plate) => (await api("POST", "/vehicles", t, { plate, vehicleType: "kamyon", bodyType: "kapali", capacityTon: 10 })).body.id;
const V1 = await vehicle(C, `30 DA ${run}`), V2 = await vehicle(C, `30 DB ${run}`), VO = await vehicle(O, `30 DC ${run}`);

console.log("\nYükleme kuralları");
check("girişsiz 401", (await upload(null, { type: "src" }, PDF)).status === 401);
let r = await upload(C, { type: "src" });
check("dosyasız 400", r.status === 400 && r.body.message === "Dosya seçin", JSON.stringify(r.body));
r = await upload(C, { type: "src" }, HTML, "belge.pdf", "application/pdf");
check("adı .pdf, beyanı application/pdf olan HTML 415", r.status === 415 && /PDF, JPEG ya da PNG/.test(r.body.message), JSON.stringify(r.body));
r = await upload(C, { type: "src" }, Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]), "buyuk.pdf");
check("10 MB'tan büyük 413 (Türkçe)", r.status === 413 && r.body.message === "Dosya en çok 10 MB olabilir", JSON.stringify(r.body).slice(0, 200));
r = await upload(C, { type: "ruhsat" }, PNG);
check("ruhsat araçsız 400", r.status === 400 && /Aracı seçin/.test(r.body.message), JSON.stringify(r.body));
check("başkasının aracına ruhsat 404", (await upload(C, { type: "ruhsat", vehicleId: VO }, PNG)).status === 404);
check("K belgesi araca bağlanamaz 400", (await upload(C, { type: "k_belgesi", vehicleId: V1 }, PDF)).status === 400);
check("geçersiz tür 400", (await upload(C, { type: "kimlik" }, PDF)).status === 400);
r = await upload(S, { type: "ruhsat", vehicleId: V1 }, PNG);
check("yük sahibi ruhsat yükleyemez 403", r.status === 403, JSON.stringify(r.body));
check("nakliyeci vergi levhası yükleyemez 403", (await upload(C, { type: "vergi_levhasi" }, PDF)).status === 403);
r = await upload(S, { type: "vergi_levhasi" }, PDF);
check("firması olmayan vergi levhası 409", r.status === 409 && r.body.message === "Önce firma bilgilerinizi girin", JSON.stringify(r.body));

console.log("\nYükleme, yerine geçme ve imzalı bağlantı");
r = await upload(C, { type: "ruhsat", vehicleId: V1 }, PNG, "ruhsat.jpg", "image/jpeg");
const D1 = r.body.id;
check("ruhsat yüklendi 201: incelemede, tür baytlardan (png)", r.status === 201 && r.body.status === "bekliyor" && r.body.contentType === "image/png" && r.body.plate === `30DA${run}`, JSON.stringify(r.body));
r = await api("GET", `/documents/${D1}/url`, C);
const url1 = r.body.path;
check("sahibine imzalı yol (5 dk)", r.status === 200 && /^\/files\/documents\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png\?exp=\d+&sig=/.test(url1) && Math.abs(new Date(r.body.expiresAt) - Date.now() - 300e3) < 10e3, JSON.stringify(r.body));
let f = await fetchFile(url1);
check("dosya aynı baytlarla, nosniff, önbelleksiz, inline", f.status === 200 && f.bytes.equals(PNG) && f.headers.get("content-type") === "image/png" && f.headers.get("x-content-type-options") === "nosniff" && /no-store/.test(f.headers.get("cache-control")) && /^inline/.test(f.headers.get("content-disposition")), `${f.status} ${f.headers.get("content-type")}`);
check("görselde betik engelleyen CSP", /default-src 'none'/.test(f.headers.get("content-security-policy") ?? ""));
check("imza değişince 403", (await fetchFile(url1.replace(/sig=./, (m) => (m.endsWith("A") ? "sig=B" : "sig=A")))).status === 403);
check("süre uzatılınca 403 (imza süreyi de kapsar)", (await fetchFile(url1.replace(/exp=(\d+)/, (_, e) => `exp=${Number(e) + 3600}`))).status === 403);
check("imzasız 403", (await fetchFile(url1.split("?")[0])).status === 403);
check("yol geçişi denemesi reddedilir", [403, 404].includes((await fetchFile(`/files/documents/..%2F..%2F${Cid}/x.png?exp=9999999999&sig=x`)).status));
check("başkası bağlantı alamaz 404", (await api("GET", `/documents/${D1}/url`, O)).status === 404);
check("yönetici bağlantı alır, açma loglanır", (await api("GET", `/documents/${D1}/url`, A)).status === 200 && log().includes(`belge ${D1} dosyasını açtı`));

r = await upload(C, { type: "ruhsat", vehicleId: V1 }, JPG, "ruhsat2.jpg");
const D1b = r.body.id;
check("incelemedeki belge yeniden yüklenince yerine geçer", r.status === 201 && D1b !== D1 && psql(`select count(*) from documents where owner_user_id='${Cid}' and type='ruhsat' and vehicle_id='${V1}'`) === "1");
check("eski dosya silindi (imzalı bağlantı 404)", (await fetchFile(url1)).status === 404);
r = await api("GET", "/documents", C);
check("belgelerim: plaka ve durumla", r.status === 200 && r.body.items.length === 1 && r.body.items[0].id === D1b && r.body.items[0].plate === `30DA${run}` && r.body.items[0].contentType === "image/jpeg", JSON.stringify(r.body));

console.log("\nYönetici kuyruğu ve karar");
check("yönetici olmayan kuyruğu göremez 403", (await api("GET", "/admin/documents", C)).status === 403);
r = await api("GET", "/admin/documents?status=bekliyor", A);
const q1 = r.body.items?.find((d) => d.id === D1b);
check("kuyrukta: sahip numarası, araç plakası, tür", r.status === 200 && q1?.owner?.phone === phone(1) && q1?.vehicle?.plate === `30DA${run}` && q1?.type === "ruhsat" && q1?.company === null, JSON.stringify(q1));
check("ret sebepsiz 400", (await api("POST", `/admin/documents/${D1b}/review`, A, { decision: "ret" })).status === 400);
r = await api("POST", `/admin/documents/${D1b}/review`, A, { decision: "ret", rejectReason: "Fotoğraf bulanık, plaka okunmuyor" });
check("ret 200", r.status === 200 && r.body.status === "ret", JSON.stringify(r.body));
check("ikinci karar 409", (await api("POST", `/admin/documents/${D1b}/review`, A, { decision: "onay" })).status === 409);
check("olmayan belge 404", (await api("POST", `/admin/documents/00000000-0000-4000-8000-000000000000/review`, A, { decision: "onay" })).status === 404);
let notes = (await api("GET", "/notifications", C)).body.items.filter((n) => n.type === "document_review");
check("sahibine ret bildirimi sebebiyle", notes.some((n) => n.title === "Belgeniz reddedildi" && n.body.includes(`30DA${run}`) && n.body.includes("plaka okunmuyor")), JSON.stringify(notes));
check("seviye hâlâ 0", level(Cid) === "0");
r = await api("GET", "/documents", C);
check("belgelerimde ret sebebi", r.body.items[0].status === "ret" && r.body.items[0].rejectReason === "Fotoğraf bulanık, plaka okunmuyor");

const D2 = (await upload(C, { type: "ruhsat", vehicleId: V1 }, PNG)).body.id;
check("geçmiş tarihli geçerlilik sonu 400", (await api("POST", `/admin/documents/${D2}/review`, A, { decision: "onay", expiresAt: trDay(-1) })).status === 400);
r = await api("POST", `/admin/documents/${D2}/review`, A, { decision: "onay" });
check("ruhsat onaylandı → seviye 1, rozet", r.status === 200 && level(Cid) === "1" && (await api("GET", `/users/${Cid}/reputation`, S)).body.verified === true);
check("onayla eski (reddedilen) kayıt silindi", psql(`select count(*) from documents where owner_user_id='${Cid}' and type='ruhsat'`) === "1");
check("güven skoru seviyeyle yeniden hesaplandı", Number(psql(`select trust_score from users where id='${Cid}'`)) > 0.25);
const Dk = (await upload(C, { type: "k_belgesi" }, PDF)).body.id;
const Ds = (await upload(C, { type: "src" }, PDF)).body.id;
await api("POST", `/admin/documents/${Dk}/review`, A, { decision: "onay" });
check("K belgesi tek başına seviye 2 yapmaz", level(Cid) === "1");
await api("POST", `/admin/documents/${Ds}/review`, A, { decision: "onay", expiresAt: trDay(30) });
check("+ SRC → seviye 2", level(Cid) === "2");
r = await api("GET", "/admin/documents?status=onay", A);
check("onaylılar kuyruğunda, karar tarihine göre", r.body.items?.[0]?.id === Ds && !!r.body.items[0].reviewedAt, JSON.stringify(r.body.items?.slice(0, 2).map((d) => d.id)));

console.log("\nSüresi geçen belge");
psql(`update documents set expires_at = '${trDay(-1)}' where id='${Ds}'`);
r = await api("POST", "/admin/tick", A);
check("tur süresi geçen belgeyi işledi → seviye 1", r.status === 200 && r.body.documentsExpired >= 1 && level(Cid) === "1", JSON.stringify(r.body));
const expiredNote = () => psql(`select count(*) from notifications where user_id='${Cid}' and ref_key='doc-expired:${Ds}'`);
check("sahibine 'süresi doldu' bildirimi", expiredNote() === "1");
await api("POST", "/admin/tick", A);
check("ikinci turda yeniden bildirilmez", expiredNote() === "1");

console.log("\nAraç silinince araca bağlı belgeler silinir");
const Dsig = (await upload(C, { type: "sigorta", vehicleId: V1 }, JPG)).body.id;
const sigUrl = (await api("GET", `/documents/${Dsig}/url`, C)).body.path;
const ruhsatUrl = (await api("GET", `/documents/${D2}/url`, C)).body.path;
check("silmeden önce dosyalar açılıyor", (await fetchFile(sigUrl)).status === 200 && (await fetchFile(ruhsatUrl)).status === 200);
check("araç silindi", (await api("DELETE", `/vehicles/${V1}`, C)).status === 204);
check("araca bağlı ruhsat ve sigorta satırları silindi; K belgesi ve SRC kaldı", psql(`select count(*) from documents where vehicle_id='${V1}'`) === "0" && psql(`select count(*) from documents where owner_user_id='${Cid}' and vehicle_id is null`) === "2");
check("dosyaları da silindi", (await fetchFile(sigUrl)).status === 404 && (await fetchFile(ruhsatUrl)).status === 404);
check("etkin araçta onaylı ruhsat kalmadı → seviye 0", level(Cid) === "0");
const D3 = (await upload(C, { type: "ruhsat", vehicleId: V2 }, PNG)).body.id;
await api("POST", `/admin/documents/${D3}/review`, A, { decision: "onay" });
check("diğer aracın ruhsatı onaylanınca seviye 1 (K belgesi var, SRC süresi geçti)", level(Cid) === "1");

console.log("\nYük sahibi: vergi levhası");
await api("POST", "/companies", S, { title: `Yüksekova Ticaret ${run}`, taxNo: "1234567890", taxOffice: "Hakkari", address: "Merkez" });
r = await upload(S, { type: "vergi_levhasi" }, PDF, "levha.pdf");
const Dv = r.body.id;
check("vergi levhası yüklendi (pdf)", r.status === 201 && r.body.contentType === "application/pdf", JSON.stringify(r.body));
r = await api("GET", "/admin/documents", A);
check("kuyrukta firma bilgisiyle", r.body.items?.find((d) => d.id === Dv)?.company?.title === `Yüksekova Ticaret ${run}`);
const pdfFile = await fetchFile((await api("GET", `/documents/${Dv}/url`, A)).body.path);
check("PDF application/pdf, CSP yok (görüntüleyici bozulmasın)", pdfFile.status === 200 && pdfFile.headers.get("content-type") === "application/pdf" && !pdfFile.headers.get("content-security-policy") && pdfFile.bytes.equals(PDF));
await api("POST", `/admin/documents/${Dv}/review`, A, { decision: "onay" });
r = await api("GET", "/me", S);
check("onay: firma doğrulandı, seviye 1", r.body.company?.verified === true && r.body.verificationLevel === 1, JSON.stringify(r.body));
const locs = (await api("GET", "/locations")).body;
const district = (prov, name) => locs.find((p) => p.name === prov).districts.find((d) => d.name === name).id;
r = await api("POST", "/loads", S, {
  originDistrictId: district("Hakkari", "Yüksekova"), destDistrictId: district("Şırnak", "Cizre"), loadFrom: trDay(3), loadTo: trDay(3),
  cargoType: "genel", weightTon: 5, vehicleType: "kamyon", bodyType: null, priceType: "teklif", price: null,
});
check("seviye 1 yük sahibinin ilk ilanı moderasyonsuz (BR-11)", r.status === 201 && r.body.status !== "moderasyonda", JSON.stringify(r.body).slice(0, 160));
await api("POST", `/loads/${r.body.id}/close`, S, { reason: "iptal" });
await api("PATCH", "/companies", S, { title: `Yüksekova Lojistik ${run}` });
r = await api("GET", "/me", S);
check("unvan değişince firma onayı ve seviye düşer", r.body.company?.verified === false && r.body.verificationLevel === 0, JSON.stringify(r.body));

console.log("\nGünlük yükleme sınırı");
const U = await user(phone(4), ["carrier"]);
const Uid = idOf(phone(4));
psql(`insert into documents (owner_user_id, type, file_key, content_type, size_bytes, status) select '${Uid}', 'src', 'documents/${Uid}/' || gen_random_uuid() || '.pdf', 'application/pdf', 10, 'ret' from generate_series(1, 20)`);
r = await upload(U, { type: "src" }, PDF);
check("24 saatte 20 yüklemeden sonra 429", r.status === 429, JSON.stringify(r.body));
psql(`delete from documents where owner_user_id='${Uid}'`);

console.log("\nHesap silinince belgeler ve dosyaları silinir");
const X = await user(phone(5), ["carrier"]);
const Xid = idOf(phone(5));
const Dx = (await upload(X, { type: "src" }, PDF)).body.id;
const xUrl = (await api("GET", `/documents/${Dx}/url`, X)).body.path;
check("silmeden önce dosya açılıyor", (await fetchFile(xUrl)).status === 200);
await api("POST", "/me/deletion-code", X);
await sleep(300);
r = await api("DELETE", "/me", X, { code: lastCode(phone(5), "hesap silme") });
check("hesap silindi", r.status === 200, JSON.stringify(r.body));
check("belge satırı ve dosyası silindi, seviye 0", psql(`select count(*) from documents where owner_user_id='${Xid}'`) === "0" && (await fetchFile(xUrl)).status === 404 && level(Xid) === "0");

console.log(`\nSonuç: ${pass} geçti, ${fail} kaldı`);
process.exitCode = fail ? 1 : 0;
