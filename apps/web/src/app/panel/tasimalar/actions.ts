"use server";

import { createRatingSchema } from "@nakliye/shared";
import { refresh } from "next/cache";
import { api, ApiError } from "@/lib/api";

export interface JobFormState {
  error?: string;
  /** Yeni teslim kodu (yalnız bu yanıtta döner) */
  deliveryCode?: string;
  done?: boolean;
}

const jobPath = (form: FormData, action: string) => `/jobs/${encodeURIComponent(String(form.get("id") ?? ""))}/${action}`;

async function run(path: string, body?: unknown): Promise<JobFormState> {
  try {
    await api(path, { method: "POST", body });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.fields.reason ?? e.message };
    throw e;
  }
  refresh();
  return { done: true };
}

/** Teslimi elle onayla (BR-31: kod girilemediyse) ya da teslimden sonra tamamla. */
export async function completeJobAction(_prev: JobFormState, form: FormData) {
  return run(jobPath(form, "complete"));
}

/** Teslime itiraz (BR-32: teslimden sonra 48 saat içinde; sebep zorunlu). */
export async function disputeJobAction(_prev: JobFormState, form: FormData) {
  return run(jobPath(form, "dispute"), { reason: String(form.get("reason") ?? "") });
}

/** İptal (teslimden önce; sebep zorunlu, iptal oranına yazılır — BR-30). */
export async function cancelJobAction(_prev: JobFormState, form: FormData) {
  return run(jobPath(form, "cancel"), { reason: String(form.get("reason") ?? "") });
}

/** Yeni teslim kodu: eskisi geçersizleşir, deneme sayacı sıfırlanır; kod bir kez gösterilir ve SMS'le gider. */
export async function newCodeAction(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  try {
    const r = await api<{ deliveryCode: string }>(jobPath(form, "delivery-code"), { method: "POST" });
    return { deliveryCode: r.deliveryCode };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
}

/** Puanlama (FR-40): yıldız, etiketler, yorum. Kör: karşı taraf da puanlayınca ya da süre bitince görünür. */
export async function rateJobAction(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  const parsed = createRatingSchema.safeParse({
    stars: Number(form.get("stars")),
    tags: form.getAll("tags").map(String),
    comment: String(form.get("comment") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { error: form.get("stars") ? "Puan bilgisi geçersiz" : "1–5 arasında bir puan seçin" };
  return run(jobPath(form, "rating"), parsed.data);
}
