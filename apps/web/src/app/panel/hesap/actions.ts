"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/session";

export interface DeletionState {
  /** Kod gönderildi: kod formu açık kalır (yeniden gönderme hatasında da) */
  sent?: boolean;
  error?: string;
  fields?: Record<string, string>;
}

/** Silme onay kodu hesabın numarasına gider. Süren taşıma varsa API kod göndermez (409, mesaj gösterilir). */
export async function requestDeletionCodeAction(prev: DeletionState): Promise<DeletionState> {
  try {
    await api("/me/deletion-code", { method: "POST" });
  } catch (e) {
    if (e instanceof ApiError) return { sent: prev.sent, error: e.message };
    throw e;
  }
  return { sent: true };
}

/** Hesabı siler (FR-07); başarıda oturum çerezleri silinir ve giriş sayfası bilgi notuyla açılır. */
export async function deleteAccountAction(_prev: DeletionState, form: FormData): Promise<DeletionState> {
  const code = String(form.get("code") ?? "").trim();
  try {
    await api("/me", { method: "DELETE", body: { code } });
  } catch (e) {
    if (e instanceof ApiError) return { sent: true, error: e.fields.code ? undefined : e.message, fields: e.fields };
    throw e;
  }
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect("/giris?hesap=silindi");
}

export interface FreezeState {
  error?: string;
}

/** Hesabı dondurur (FR-08); başarıda oturum çerezleri silinir ve giriş sayfası bilgi notuyla açılır. Süren taşımada 409 mesajı. */
export async function freezeAccountAction(): Promise<FreezeState> {
  try {
    await api("/me/freeze", { method: "POST" });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect("/giris?hesap=donduruldu");
}
