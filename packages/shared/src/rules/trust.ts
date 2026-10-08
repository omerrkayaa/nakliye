// Güven skoru — docs/03 BR-10, BR-30

export interface TrustInput {
  /** 1–5 ortalama; hiç puan yoksa null */
  avgStars: number | null;
  ratingCount: number;
  completedJobs: number;
  /** 0: sadece telefon, 1: kimlik/firma veya ruhsat onaylı, 2: K belgesi + SRC ya da 3+ tamamlanmış iş */
  verificationLevel: 0 | 1 | 2;
  /** iptal edilen iş / toplam iş, 0–1 */
  cancelRate: number;
  /** haklı bulunan şikayet / gösterilen ilan veya iş, 0–1 */
  reportRate: number;
}

/** Bu kadar tamamlanmış işte "deneyim" bileşeni doygunluğa ulaşır. */
const COMPLETED_SATURATION = 50;
const POSITIVE_WEIGHT_SUM = 0.4 + 0.25 + 0.15;

/**
 * Bayes ortalaması: puanlar, PRIOR_COUNT adet nötr (PRIOR_STARS) sanal puanla başlar.
 * Az puanlı kullanıcıda tek puan skoru sert oynatmasın (düz ortalamada tek 1 yıldız yeni üyeyi 0,25'ten 0,06'ya düşürüyordu).
 */
const PRIOR_STARS = 3;
const PRIOR_COUNT = 3;

export const smoothedStars = (avgStars: number | null, ratingCount: number) =>
  ratingCount > 0 && avgStars !== null ? (avgStars * ratingCount + PRIOR_STARS * PRIOR_COUNT) / (ratingCount + PRIOR_COUNT) : PRIOR_STARS;

export function trustScore(i: TrustInput): number {
  // Hiç puanı olmayan yeni üyede ortalama nötr 3 yıldız → puan bileşeni 0,5 (BR-30).
  const ratingNorm = (smoothedStars(i.avgStars, i.ratingCount) - 1) / 4;
  const experienceNorm = Math.min(1, Math.log(i.completedJobs + 1) / Math.log(COMPLETED_SATURATION + 1));
  const verificationNorm = i.verificationLevel / 2;

  const positive = 0.4 * ratingNorm + 0.25 * experienceNorm + 0.15 * verificationNorm;
  const penalty = 0.15 * clamp01(i.cancelRate) + 0.05 * clamp01(i.reportRate);
  // Pozitif ağırlıkların toplamı 0,8; kusursuz kullanıcı 1 alsın diye normalize edilir.
  const raw = (positive - penalty) / POSITIVE_WEIGHT_SUM;

  return Math.round(clamp01(raw) * 1000) / 1000;
}

/** "✅ Doğrulanmış" rozeti (BR-10) */
export const isVerifiedBadge = (verificationLevel: number) => verificationLevel >= 1;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
