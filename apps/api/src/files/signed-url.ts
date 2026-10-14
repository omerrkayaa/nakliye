import { createHmac, timingSafeEqual } from "node:crypto";
import { DOCUMENT_LIMITS } from "@nakliye/shared";

/**
 * Belge dosyası için süreli imzalı bağlantı (docs/04 §8: 5 dk). Anahtar FILE_URL_SECRET (yoksa ya da boşsa JWT_SECRET; ayrı önekle).
 * Bağlantıyı yalnız belgenin sahibi ve yönetici alır (GET /documents/:id/url); dosya isteği girişsizdir, imzayla açılır.
 */
// `||`: boş verilen FILE_URL_SECRET de JWT_SECRET'e düşer (`??` boş metni geçerli sayıp imzayı anahtarsız yapardı)
const secret = () => process.env.FILE_URL_SECRET || process.env.JWT_SECRET || "";
const mac = (key: string, exp: number) => createHmac("sha256", secret()).update(`file-url:${key}:${exp}`).digest("base64url");

export function signFileUrl(key: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + DOCUMENT_LIMITS.urlTtlSec;
  return { path: `/files/${key}?exp=${exp}&sig=${mac(key, exp)}`, expiresAt: new Date(exp * 1000) };
}

export function verifyFileUrl(key: string, exp: string | undefined, sig: string | undefined, now = Date.now()): boolean {
  if (!exp || !sig || !/^\d{1,12}$/.test(exp)) return false;
  const e = Number(exp);
  if (e * 1000 < now) return false;
  const want = Buffer.from(mac(key, e));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
