"use server";

import { cookies } from "next/headers";
import QRCode from "qrcode";
import { api, ApiError } from "@/lib/api";
import { accessCookie, refreshCookie, type Tokens } from "@/lib/session";

export interface SetupState {
  /** Elle girilecek anahtar (base32) ve aynı bilginin QR'ı (PNG data URL) */
  secret?: string;
  qr?: string;
  /** Etkinleşince bir kez gösterilir */
  recoveryCodes?: string[];
  error?: string;
}

const codeOf = (form: FormData) => String(form.get("code") ?? "").trim();

/** NFR-04 kurulum: yeni anahtar. Cihaz değiştirmede mevcut uygulamadan (ya da kurtarma kodundan) kod gerekir. */
export async function startSetupAction(_prev: SetupState, form: FormData): Promise<SetupState> {
  const code = codeOf(form);
  try {
    const r = await api<{ secret: string; otpauthUrl: string }>("/me/totp/setup", { method: "POST", body: code ? { code } : {} });
    return { secret: r.secret, qr: await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" }) };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
}

/** Uygulamadaki kodla onay: diğer oturumlar kapanır, bu oturum ikinci adımlı yeni belirteçlerle sürer */
export async function enableAction(prev: SetupState, form: FormData): Promise<SetupState> {
  const code = codeOf(form);
  if (!/^\d{6}$/.test(code)) return { ...prev, error: "Uygulamadaki 6 haneli kodu girin" };
  try {
    const r = await api<Tokens & { recoveryCodes: string[] }>("/me/totp/enable", { method: "POST", body: { code } });
    const jar = await cookies();
    jar.set(accessCookie(r.accessToken));
    jar.set(refreshCookie(r.refreshToken));
    return { recoveryCodes: r.recoveryCodes };
  } catch (e) {
    if (e instanceof ApiError) return { ...prev, error: e.message };
    throw e;
  }
}

export interface RegenerateState {
  recoveryCodes?: string[];
  error?: string;
}

/** Yeni kurtarma kodları (eskiler geçersizleşir) */
export async function regenerateAction(_prev: RegenerateState, form: FormData): Promise<RegenerateState> {
  const code = codeOf(form);
  if (code.length < 6) return { error: "Uygulamadaki 6 haneli kodu ya da bir kurtarma kodunu girin" };
  try {
    return await api<{ recoveryCodes: string[] }>("/me/totp/recovery-codes", { method: "POST", body: { code } });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
}
