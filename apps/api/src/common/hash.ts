import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Silinen hesabın numarasının anahtarlı özeti (FR-07, 60 gün saklanır). Numara uzayı küçük olduğundan düz özet
 * kaba kuvvetle çözülürdü; anahtar (OTP_PEPPER) gizli kaldıkça çözülemez. Anahtar değişirse eski bağlar düşer.
 */
export const deletedPhoneHmac = (phone: string) => createHmac("sha256", process.env.OTP_PEPPER ?? "").update(`deleted-phone:${phone}`).digest("hex");

/** 6 haneli sayısal kod (OTP ve teslim kodu) */
export const sixDigitCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
