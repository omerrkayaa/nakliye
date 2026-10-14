"use server";

import { phoneSchema } from "@nakliye/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { accessCookie, refreshCookie, type MfaChallenge, type Tokens } from "@/lib/session";

export interface LoginState {
  /** totp: yönetici hesabı, SMS kodundan sonra doğrulama uygulamasındaki kod (NFR-04) */
  step: "phone" | "code" | "totp";
  phone?: string;
  /** SMS adımını geçtiğinin kanıtı (5 dk); ikinci adımda geri gönderilir */
  challenge?: string;
  error?: string;
}

const failure = (e: unknown) => (e instanceof ApiError ? e.message : "Sunucuya ulaşılamadı; tekrar deneyin.");

/** Yalnız panel içine dönüş (açık yönlendirmeye karşı) */
const safeNext = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\/panel(\/[\w\-/]*)?$/.test(v) ? v : "/panel");

/** Belirteçler httpOnly çereze; hesap girişle yeniden açıldıysa (FR-08 dondurma, FR-07 süresi içinde dönüş) gösterge bir kez not gösterir */
async function signIn(tokens: Tokens, form: FormData, reopened = tokens.reopened): Promise<never> {
  const jar = await cookies();
  jar.set(accessCookie(tokens.accessToken));
  jar.set(refreshCookie(tokens.refreshToken));
  redirect(reopened ? `/panel?acildi=${reopened}` : safeNext(form.get("sonra")));
}

/**
 * P1 giriş: "request" → SMS kodu gönderilir; "verify" → kod doğrulanır, belirteçler httpOnly çereze yazılır.
 * İkinci adımı kurulu hesapta (yönetici) "verify" belirteç yerine challenge döner → "totp" adımı.
 */
export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (form.get("intent") === "change") return { step: "phone" };

  if (form.get("intent") === "totp") {
    const phone = String(form.get("phone") ?? "");
    const challenge = String(form.get("challenge") ?? "");
    const code = String(form.get("code") ?? "").trim();
    if (code.length < 6) return { step: "totp", phone, challenge, error: "Uygulamadaki 6 haneli kodu ya da bir kurtarma kodunu girin" };
    let tokens: Tokens;
    try {
      tokens = await api<Tokens>("/auth/totp", { method: "POST", body: { challenge, code }, auth: false });
    } catch (e) {
      // 5 dk geçtiyse ya da challenge kullanıldıysa baştan: yeni SMS kodu gerekir
      if (e instanceof ApiError && e.message.startsWith("Doğrulama süresi doldu")) return { step: "phone", phone, error: e.message };
      return { step: "totp", phone, challenge, error: failure(e) };
    }
    return signIn(tokens, form);
  }

  if (form.get("intent") === "request") {
    const parsed = phoneSchema.safeParse(form.get("phone"));
    if (!parsed.success) return { step: "phone", error: parsed.error.issues[0]?.message };
    try {
      await api("/auth/otp/request", { method: "POST", body: { phone: parsed.data }, auth: false, forwardIp: true });
    } catch (e) {
      return { step: form.get("resend") ? "code" : "phone", phone: parsed.data, error: failure(e) };
    }
    return { step: "code", phone: parsed.data };
  }

  const phone = String(form.get("phone") ?? "");
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { step: "code", phone, error: "SMS ile gelen 6 haneli kodu girin" };
  let res: Tokens | MfaChallenge;
  try {
    res = await api<Tokens | MfaChallenge>("/auth/otp/verify", { method: "POST", body: { phone, code }, auth: false });
  } catch (e) {
    return { step: "code", phone, error: failure(e) };
  }
  if ("mfaRequired" in res) return { step: "totp", phone, challenge: res.challenge };
  return signIn(res, form);
}
