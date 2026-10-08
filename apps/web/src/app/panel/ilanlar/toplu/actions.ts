"use server";

import { refresh } from "next/cache";
import { BULK_LOAD_MAX, type CreateLoadInput } from "@nakliye/shared";
import { api, ApiError } from "@/lib/api";
import { MAX_FILE_BYTES, parseWorkbook, type PreviewRow } from "@/lib/bulk";
import { getLocations } from "@/lib/locations";

export interface PreviewState {
  error?: string;
  rows?: PreviewRow[];
  fileName?: string;
}

/** Dosyayı oku ve önizle (henüz ilan açılmaz). Dosya bellekte okunur, saklanmaz. */
export async function previewBulkAction(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Bir Excel dosyası seçin." };
  if (!/\.xlsx$/i.test(file.name)) return { error: "Yalnız .xlsx dosyası yüklenebilir (Excel'de “Farklı kaydet → Excel Çalışma Kitabı”)." };
  if (file.size > MAX_FILE_BYTES) return { error: "Dosya 1 MB'tan büyük." };
  const { rows, error } = await parseWorkbook(await file.arrayBuffer(), await getLocations());
  return error ? { error, fileName: file.name } : { rows, fileName: file.name };
}

export interface PublishState {
  error?: string;
  results?: { row: number; id?: string; status?: string; error?: string }[];
  created?: number;
}

/** Önizlemede hazır görünen satırları yayınla. Son doğrulama API'de (POST /loads/bulk, satır satır). */
export async function publishBulkAction(_prev: PublishState, form: FormData): Promise<PublishState> {
  let rows: { row: number; input: CreateLoadInput }[];
  try {
    rows = JSON.parse(String(form.get("rows") ?? "[]"));
  } catch {
    return { error: "Önizleme bozuk; dosyayı tekrar yükleyin." };
  }
  if (!Array.isArray(rows) || rows.length === 0) return { error: "Yayınlanacak satır yok." };
  if (rows.length > BULK_LOAD_MAX) return { error: `Tek seferde en fazla ${BULK_LOAD_MAX} ilan.` };
  try {
    const r = await api<{ created: number; results: { row: number; id?: string; status?: string; error?: string }[] }>("/loads/bulk", {
      method: "POST",
      body: { items: rows.map((x) => x.input) },
    });
    refresh();
    // API satırı istek sırasına göre numaralar; Excel satır numarasına çevir
    return { created: r.created, results: r.results.map((x) => ({ ...x, row: rows[x.row - 1]?.row ?? x.row })) };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
}
