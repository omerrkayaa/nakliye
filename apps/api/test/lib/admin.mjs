// Uçtan uca testler için yönetici oturumu (NFR-04 iki adımlı doğrulama). TOTP burada API'nin kodundan bağımsız
// yazıldı (RFC 6238: HMAC-SHA-1, 6 hane, 30 sn), böylece testler API'nin hesabını kendisiyle doğrulamaz.
import { createHmac } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Decode(s) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s.replace(/=+$/, "")) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Uygulamanın o an göstereceği kod; offset: 30 sn'lik adım kaydırma (-1 önceki kod, +1 sonraki) */
export function totp(secretB32, offset = 0, ms = Date.now()) {
  const counter = Math.floor(ms / 30_000) + offset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const o = h[19] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/**
 * Rolü DB'den verilmiş yöneticinin ikinci adım kurulumu: setup → uygulama kodu → enable. Dönen erişim belirteci yönetici
 * rolünü taşır (kurulumsuz belirteçte rol yoktur). api: takımın api(method, path, token, body) yardımcısı.
 */
export async function adminSession(api, accessToken) {
  const s = await api("POST", "/me/totp/setup", accessToken, {});
  if (s.status !== 201) throw new Error(`TOTP kurulumu başlamadı: ${s.status} ${JSON.stringify(s.body)}`);
  const e = await api("POST", "/me/totp/enable", accessToken, { code: totp(s.body.secret) });
  if (e.status !== 201) throw new Error(`TOTP etkinleşmedi: ${e.status} ${JSON.stringify(e.body)}`);
  return { ...e.body, secret: s.body.secret, accessToken: e.body.accessToken };
}
