// Puanlama — docs/03 FR-40, FR-41, BR-31
import type { RatingTag } from "../constants.js";

export const RATING_PARAMS = {
  /** İş tamamlandıktan sonra puan verilebilecek süre (gün) */
  windowDays: 14,
  /** Profilde gösterilen son puan/yorum sayısı (FR-41) */
  publicRecent: 10,
};

const DAY = 86_400_000;

/** Puanlanan tarafa göre seçilebilecek etiketler: "ödeme sorunsuz" yalnız yük sahibine, "yüke özenli" yalnız nakliyeciye. */
export const RATING_TAGS_FOR: Record<"shipper" | "carrier", readonly RatingTag[]> = {
  carrier: ["zamaninda", "iletisim_iyi", "yuk_ozenli", "gec_kaldi", "fiyat_degisti"],
  shipper: ["zamaninda", "iletisim_iyi", "odeme_sorunsuz", "gec_kaldi", "fiyat_degisti"],
};

/**
 * Puanlama süresinin son anı. Kör puanlama (misillemeye karşı): puan, iki taraf da puanlayınca ya da bu an geçince
 * görünür ve güven skoruna girer; o zamana kadar karşı taraf yalnız "puanlandınız" bilgisini alır.
 */
export const ratingDeadline = (completedAt: Date) => new Date(completedAt.getTime() + RATING_PARAMS.windowDays * DAY);
