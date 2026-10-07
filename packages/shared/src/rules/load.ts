// Yük ilanı durum makinesi ve tarih kuralları — docs/03 §6 (durum diyagramı), BR-01…BR-04, BR-11
import type { LoadStatus } from "../constants.js";

// ── Türkiye saati ────────────────────────────────────────────────────
// Türkiye 2016'dan beri yıl boyu UTC+3 (yaz saati yok). Yükleme tarihleri gün olarak tutulur ve TR gününe göre yorumlanır.
const TR_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** Verilen andaki Türkiye tarihi (YYYY-AA-GG). */
export function trDay(now: Date): string {
  return new Date(now.getTime() + TR_OFFSET_MS).toISOString().slice(0, 10);
}

/** TR gününün başlangıç anı (00:00 TR). */
export function trDayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000+03:00`);
}

/** TR gününün bitiş anı (23:59:59.999 TR). */
export function trDayEnd(day: string): Date {
  return new Date(trDayStart(day).getTime() + DAY_MS - 1);
}

const daysBetween = (a: string, b: string) => Math.round((trDayStart(b).getTime() - trDayStart(a).getTime()) / DAY_MS);

// ── Tarih kuralları ──────────────────────────────────────────────────
/** Varsayılan sınırlar (docs/03'te tanımsızdı; 2026-10-07'de eklendi, parametrik). */
export const LOAD_DATE_LIMITS = {
  /** Yükleme en fazla kaç gün sonrası için verilebilir */
  maxDaysAhead: 60,
  /** Yükleme tarih aralığı en fazla kaç gün olabilir */
  maxRangeDays: 30,
};

/**
 * İlan tarih aralığını denetler; sorun yoksa null, varsa kullanıcıya gösterilecek mesaj döner.
 * @param label mesajlarda geçen ad ("Yükleme", "Müsaitlik")
 */
export function dateRangeError(from: string, to: string, now: Date, limits = LOAD_DATE_LIMITS, label = "Yükleme"): string | null {
  const today = trDay(now);
  if (from > to) return "Bitiş tarihi başlangıçtan önce olamaz";
  if (to < today) return `${label} tarihi geçmişte olamaz`;
  if (daysBetween(today, from) > limits.maxDaysAhead) return `${label} en fazla ${limits.maxDaysAhead} gün sonrası için verilebilir`;
  if (daysBetween(from, to) > limits.maxRangeDays) return `${label} aralığı en fazla ${limits.maxRangeDays} gün olabilir`;
  return null;
}

/** Yük ilanı yükleme tarihleri (bkz. dateRangeError). */
export const loadDateError = (loadFrom: string, loadTo: string, now: Date, limits = LOAD_DATE_LIMITS) =>
  dateRangeError(loadFrom, loadTo, now, limits, "Yükleme");

// ── Durum makinesi ───────────────────────────────────────────────────
/** İzin verilen geçişler. teyitli → teyitli: sahibinin "hâlâ geçerli" teyidi (son teyit zamanı yenilenir). */
export const LOAD_TRANSITIONS: Readonly<Record<LoadStatus, readonly LoadStatus[]>> = {
  taslak: ["moderasyonda", "teyitli", "iptal"],
  moderasyonda: ["teyitli", "iptal"],
  teyitli: ["teyitli", "teyit_bekliyor", "suresi_doldu", "kapandi", "iptal"],
  teyit_bekliyor: ["teyitli", "suresi_doldu", "kapandi", "iptal"],
  suresi_doldu: [],
  kapandi: [],
  iptal: [],
};

export const canTransition = (from: LoadStatus, to: LoadStatus) => LOAD_TRANSITIONS[from].includes(to);

/** Yük arayanlara görünen durumlar (listede teyitli önce, teyit bekliyor sarı rozetle altta). */
export const VISIBLE_LOAD_STATUSES: readonly LoadStatus[] = ["teyitli", "teyit_bekliyor"];

/** Sahibinin içeriğini düzenleyebileceği durumlar. */
export const EDITABLE_LOAD_STATUSES: readonly LoadStatus[] = ["moderasyonda", "teyitli", "teyit_bekliyor"];

// ── Moderasyon (BR-11) ───────────────────────────────────────────────
export const MODERATION_FREE_AFTER = 3;

/**
 * Yeni ilan moderasyona girmeli mi? Seviye 0 yük sahibi, *onaylanmış* ilan sayısı 3'e ulaşana kadar moderasyondan geçer.
 * Toplam ilan değil onaylı ilan sayılır: aksi halde reddedilen 3 çöp ilanla moderasyon atlatılabilirdi.
 */
export const needsModeration = (verificationLevel: number, approvedLoadCount: number) =>
  verificationLevel === 0 && approvedLoadCount < MODERATION_FREE_AFTER;
