import { createHash, randomBytes, randomInt } from "node:crypto";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** 6 haneli sayısal kod (OTP ve teslim kodu) */
export const sixDigitCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
