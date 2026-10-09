"use server";

import { refresh } from "next/cache";
import { api, ApiError } from "@/lib/api";

export interface FavoriteState {
  error?: string;
}

/** P7: favoriye ekle / çıkar */
export async function toggleFavoriteAction(_prev: FavoriteState, form: FormData): Promise<FavoriteState> {
  const id = encodeURIComponent(String(form.get("id") ?? ""));
  try {
    await api(`/me/carriers/${id}/favorite`, { method: form.get("favorite") === "1" ? "PUT" : "DELETE" });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
  refresh();
  return {};
}
