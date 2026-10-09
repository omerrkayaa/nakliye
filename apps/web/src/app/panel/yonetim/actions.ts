"use server";

import { refresh } from "next/cache";
import { api, ApiError } from "@/lib/api";

export interface AdminFormState {
  error?: string;
  done?: boolean;
}

const id = (form: FormData, key = "id") => encodeURIComponent(String(form.get(key) ?? ""));

async function run(path: string, body?: unknown): Promise<AdminFormState> {
  try {
    await api(path, { method: "POST", body });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.fields.reason ?? e.fields.note ?? e.message };
    throw e;
  }
  refresh();
  return { done: true };
}

/** Y4 ilan moderasyonu (BR-11): onay ya da ret */
export async function reviewLoadAction(_prev: AdminFormState, form: FormData) {
  return run(`/admin/loads/${id(form)}/review`, { decision: form.get("decision") === "ret" ? "ret" : "onay" });
}

/** Y3 şikayet kararı (FR-51): haklı/haksız + isteğe bağlı not */
export async function resolveReportAction(_prev: AdminFormState, form: FormData) {
  const note = String(form.get("note") ?? "").trim();
  return run(`/admin/reports/${id(form)}/resolve`, { decision: form.get("decision") === "hakli" ? "hakli" : "haksiz", note: note || undefined });
}

/** İtiraz kararı: teslim geçerli (tamamlandı) ya da geçersiz (iptal); gerekçe zorunlu, iki tarafa gider */
export async function resolveDisputeAction(_prev: AdminFormState, form: FormData) {
  return run(`/admin/disputes/${id(form)}/resolve`, {
    outcome: form.get("outcome") === "iptal" ? "iptal" : "tamamlandi",
    note: String(form.get("note") ?? ""),
  });
}

/** Y2 askıya al (sebep zorunlu) */
export async function suspendUserAction(_prev: AdminFormState, form: FormData) {
  return run(`/admin/users/${id(form)}/suspend`, { reason: String(form.get("reason") ?? "") });
}

export async function unsuspendUserAction(_prev: AdminFormState, form: FormData) {
  return run(`/admin/users/${id(form)}/unsuspend`);
}
