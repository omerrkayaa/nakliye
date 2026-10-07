// Canlı ilan teyidi (F1) — docs/03 BR-01…BR-05, docs/04 §5
import type { ConfirmationAnswer, LoadStatus } from "../constants.js";

export interface ConfirmationParams {
  /** Normal günlerde teyit aralığı (BR-02) */
  reminderIntervalH: number;
  /** Yükleme gününde teyit aralığı (BR-02) */
  loadDayIntervalH: number;
  /** Hatırlatmadan sonra cevap bekleme süresi (BR-03) */
  answerWindowH: number;
  /** "Teyit bekliyor"da kalma süresi (BR-04) */
  pendingGraceH: number;
  /** Push açılmazsa SMS'e geçiş süresi (docs/04 §5) */
  smsFallbackMin: number;
  /** Anında teyit isteği için gereken farklı şikayetçi sayısı (BR-05) */
  reportThreshold: number;
}

export const DEFAULT_CONFIRMATION_PARAMS: ConfirmationParams = {
  reminderIntervalH: 24,
  loadDayIntervalH: 6,
  answerWindowH: 4,
  pendingGraceH: 12,
  smsFallbackMin: 30,
  reportThreshold: 2,
};

const HOUR = 3_600_000;

export interface ConfirmableLoad {
  status: LoadStatus;
  lastConfirmedAt: Date;
  /** Son "hâlâ geçerli mi?" sorusunun gönderildiği an; cevaplanınca null yapılır */
  reminderSentAt: Date | null;
  /** Yükleme gününün başlangıcı */
  loadFromStart: Date;
  /** Yükleme tarih aralığının bitişi (son günün sonu) */
  loadToEnd: Date;
}

/** Bir sonraki "hâlâ geçerli mi?" sorusunun zamanı (BR-02). */
export function nextReminderAt(
  lastConfirmedAt: Date,
  loadFromStart: Date,
  p: ConfirmationParams = DEFAULT_CONFIRMATION_PARAMS,
): Date {
  const onLoadDay = lastConfirmedAt.getTime() >= loadFromStart.getTime();
  if (onLoadDay) return new Date(lastConfirmedAt.getTime() + p.loadDayIntervalH * HOUR);
  // Yükleme günü yaklaşırken 24 saatlik aralık yükleme gününe sarkarsa, o gün sık teyide geç.
  const normal = lastConfirmedAt.getTime() + p.reminderIntervalH * HOUR;
  const firstOnLoadDay = loadFromStart.getTime() + p.loadDayIntervalH * HOUR;
  return new Date(Math.min(normal, Math.max(firstOnLoadDay, lastConfirmedAt.getTime() + p.loadDayIntervalH * HOUR)));
}

const ACTIVE: ReadonlySet<LoadStatus> = new Set(["teyitli", "teyit_bekliyor"]);

/**
 * Zamanlayıcının her turda çağırdığı saf fonksiyon: ilanın şu anki durumunu hesaplar (BR-03, BR-04).
 * Aktif olmayan durumlar (taslak, moderasyonda, kapandi, iptal, suresi_doldu) değişmez.
 */
export function evaluateLoadStatus(
  load: ConfirmableLoad,
  now: Date,
  p: ConfirmationParams = DEFAULT_CONFIRMATION_PARAMS,
): LoadStatus {
  if (!ACTIVE.has(load.status)) return load.status;
  if (now.getTime() > load.loadToEnd.getTime()) return "suresi_doldu";
  if (!load.reminderSentAt) return load.status;

  const waited = now.getTime() - load.reminderSentAt.getTime();
  if (waited >= (p.answerWindowH + p.pendingGraceH) * HOUR) return "suresi_doldu";
  if (waited >= p.answerWindowH * HOUR) return "teyit_bekliyor";
  return load.status;
}

/** Yük sahibinin teyit cevabını yeni duruma çevirir (UC-04). */
export function applyConfirmationAnswer(answer: ConfirmationAnswer): LoadStatus {
  switch (answer) {
    case "gecerli":
      return "teyitli";
    case "arac_bulundu":
      return "kapandi";
    case "iptal":
      return "iptal";
  }
}

/** SMS yedeğine geçilmeli mi? (push açılmadı ve süre doldu) */
export function shouldSendSmsFallback(
  reminderSentAt: Date,
  pushOpened: boolean,
  now: Date,
  p: ConfirmationParams = DEFAULT_CONFIRMATION_PARAMS,
): boolean {
  return !pushOpened && now.getTime() - reminderSentAt.getTime() >= p.smsFallbackMin * 60_000;
}

/**
 * BR-05: son teyitten sonra "yük yok" diyen farklı *sayılan* şikayetçi sayısı eşiğe ulaştı mı?
 * Sayılan şikayetçi: bkz. `isQualifiedReporter` (doğrulanmış ya da ilanı aramış).
 */
export function shouldForceReconfirm(
  distinctQualifiedReporters: number,
  p: ConfirmationParams = DEFAULT_CONFIRMATION_PARAMS,
): boolean {
  return distinctQualifiedReporters >= p.reportThreshold;
}
