"use server";

import type { SettingKey } from "@nakliye/shared";
import { refresh } from "next/cache";
import { api, ApiError } from "@/lib/api";

export interface SettingsState {
  error?: string;
  fields?: Record<string, string>;
  done?: boolean;
}

/** Form alanları "weights.trust", "vehicles.tir.wearPerKm" gibi yollarla gelir → iç içe nesne; ondalık virgül de kabul */
function toObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, raw] of form.entries()) {
    if (path.startsWith("$") || path === "key") continue;
    const keys = path.split(".");
    let node = out;
    for (const k of keys.slice(0, -1)) node = (node[k] ??= {}) as Record<string, unknown>;
    // Ondalık virgül → nokta; boşluklar atılır. Binlik ayırıcı beklenmez (alanlar onsuz gösterilir)
    node[keys.at(-1)!] = String(raw).replace(/\s/g, "").replace(",", ".");
  }
  return out;
}

/** FR-54: ayarı tam nesne olarak kaydet; API'nin alan hataları formda alanın altında gösterilir */
export async function saveSettingsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const key = String(form.get("key")) as SettingKey;
  try {
    await api(`/admin/settings/${key}`, { method: "PUT", body: toObject(form) });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message, fields: e.fields };
    throw e;
  }
  refresh();
  return { done: true };
}

export async function resetSettingsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const key = String(form.get("key")) as SettingKey;
  try {
    await api(`/admin/settings/${key}/reset`, { method: "POST" });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
  refresh();
  return { done: true };
}
