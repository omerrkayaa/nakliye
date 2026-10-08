"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export interface NotifyState {
  error?: string;
  done?: string;
}

/** Bildirimi aç: okundu işaretle, varsa ilgili sayfaya git. GET bağlantısı değil: önyükleme okundu saymasın. */
export async function openNotificationAction(form: FormData) {
  const id = String(form.get("id") ?? "");
  const to = String(form.get("to") ?? "");
  await api(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }).catch(() => undefined);
  // Yalnız panel içi adres (açık yönlendirme olmasın)
  if (to.startsWith("/panel/")) redirect(to);
  refresh();
}

export async function readAllAction() {
  await api("/notifications/read-all", { method: "POST" });
  refresh();
}

/** Teyit sorusunu bildirimden cevapla (F1): hâlâ geçerli ya da araç bulundu */
export async function answerConfirmAction(_prev: NotifyState, form: FormData): Promise<NotifyState> {
  const loadId = encodeURIComponent(String(form.get("loadId") ?? ""));
  const answer = form.get("answer") === "arac_bulundu" ? "arac_bulundu" : "gecerli";
  try {
    await api(`/loads/${loadId}/confirm`, { method: "POST", body: { answer } });
    await api(`/notifications/${encodeURIComponent(String(form.get("id") ?? ""))}/read`, { method: "POST" }).catch(() => undefined);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
  refresh();
  return { done: answer === "gecerli" ? "İlan teyit edildi" : "İlan kapatıldı" };
}
