"use server";

import { phoneSchema } from "@nakliye/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { accessCookie, refreshCookie, type Tokens } from "@/lib/session";

export interface LoginState {
  step: "phone" | "code";
  phone?: string;
  error?: string;
}

const failure = (e: unknown) => (e instanceof ApiError ? e.message : "Sunucuya ulaşılamadı; tekrar deneyin.");

/** Yalnız panel içine dönüş (açık yönlendirmeye karşı) */
const safeNext = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\/panel(\/[\w\-/]*)?$/.test(v) ? v : "/panel");

/** P1 giriş: "request" → SMS kodu gönderilir; "verify" → kod doğrulanır, belirteçler httpOnly çereze yazılır. */
export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (form.get("intent") === "change") return { step: "phone" };

  if (form.get("intent") === "request") {
    const parsed = phoneSchema.safeParse(form.get("phone"));
    if (!parsed.success) return { step: "phone", error: parsed.error.issues[0]?.message };
    try {
      await api("/auth/otp/request", { method: "POST", body: { phone: parsed.data }, auth: false });
    } catch (e) {
      return { step: form.get("resend") ? "code" : "phone", phone: parsed.data, error: failure(e) };
    }
    return { step: "code", phone: parsed.data };
  }

  const phone = String(form.get("phone") ?? "");
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { step: "code", phone, error: "SMS ile gelen 6 haneli kodu girin" };
  let tokens: Tokens;
  try {
    tokens = await api<Tokens>("/auth/otp/verify", { method: "POST", body: { phone, code }, auth: false });
  } catch (e) {
    return { step: "code", phone, error: failure(e) };
  }
  const jar = await cookies();
  jar.set(accessCookie(tokens.accessToken));
  jar.set(refreshCookie(tokens.refreshToken));
  redirect(safeNext(form.get("sonra")));
}
