import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const API = "http://localhost:3000/api/v1";
const API_LOG = resolve(__dirname, "../../api/api.log");

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const psql = (q: string) =>
  execFileSync("docker", ["exec", "nakliye-db-1", "psql", "-U", "nakliye", "-d", "nakliye", "-tAc", q]).toString().trim();

const run = Date.now().toString().slice(-4);
/** Bu çalıştırmaya özel numara (+90559…): web testleri diğer takımların numaralarıyla karışmaz */
export const phone = (n: number) => `+90559${run}${String(n).padStart(3, "0")}`;
/** Formda yazılan biçim: 0559 … */
export const localPhone = (p: string) => `0${p.slice(3)}`;

/** API geliştirme modunda SMS'i loga yazar; o numaraya giden son giriş kodu. */
export async function otpFor(p: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const m = [...readFileSync(API_LOG, "utf8").matchAll(/\[SMS → (\+\d+)\] Nakliye giriş kodunuz: (\d{6})/g)].filter((x) => x[1] === p).at(-1);
    if (m) return m[2]!;
    await sleep(150);
  }
  throw new Error(`OTP bulunamadı: ${p}`);
}

export async function api<T = Record<string, string>>(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json as T };
}

/** API üzerinden giriş (tarayıcı dışı kullanıcılar: yönetici). */
export async function apiLogin(p: string) {
  await api("POST", "/auth/otp/request", undefined, { phone: p });
  const code = await otpFor(p);
  return (await api<{ accessToken: string; refreshToken: string }>("POST", "/auth/otp/verify", undefined, { phone: p, code })).body;
}

/** Yönetici belirteci: rol DB'den verilir, refresh ile rolü taşıyan belirteç alınır. */
export async function adminToken() {
  const p = phone(900);
  const t = await apiLogin(p);
  psql(`insert into user_roles(user_id, role) select id, 'admin' from users where phone='${p}' on conflict do nothing`);
  return (await api("POST", "/auth/refresh", undefined, { refreshToken: t.refreshToken })).body.accessToken!;
}

const trDay = (offset: number) => new Date(Date.now() + 3 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

/** Yük ilanı (Menteşe → Muratpaşa); moderasyona düşerse yönetici onaylar. */
export async function createLoad(token: string, admin: string) {
  const locs = (await api<{ name: string; districts: { id: number; name: string }[] }[]>("GET", "/locations")).body;
  const d = (prov: string, name: string) => locs.find((p) => p.name === prov)!.districts.find((x) => x.name === name)!.id;
  const r = await api("POST", "/loads", token, {
    originDistrictId: d("Muğla", "Menteşe"),
    destDistrictId: d("Antalya", "Muratpaşa"),
    loadFrom: trDay(1),
    loadTo: trDay(2),
    cargoType: "palet",
    weightTon: 7,
    vehicleType: "kamyon",
    bodyType: null,
    priceType: "sabit",
    price: 12500,
  });
  if (r.body.status === "moderasyonda") await api("POST", `/admin/loads/${r.body.id}/review`, admin, { decision: "onay" });
  return r.body.id!;
}
