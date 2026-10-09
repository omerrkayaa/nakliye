"use server";

import { createLoadSchema } from "@nakliye/shared";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export interface FormState {
  error?: string;
  fields?: Record<string, string>;
}

/**
 * shared şemalarının bir kısmı zod'un İngilizce varsayılan mesajını döndürüyor (ör. boş sayı alanı);
 * formda alan bazında Türkçe karşılık verilir. Şemanın kendi Türkçe mesajları (refine) olduğu gibi kalır.
 */
const FIELD_MESSAGES: Record<string, string> = {
  originDistrictId: "Kalkış ilçesini seçin",
  destDistrictId: "Varış ilçesini seçin",
  loadFrom: "Yükleme başlangıç tarihini seçin",
  loadTo: "Yükleme bitiş tarihini seçin",
  cargoType: "Yük cinsini seçin",
  weightTon: "Ağırlığı ton olarak girin (en fazla 60)",
  vehicleType: "Araç tipini seçin",
  price: "Tutarı TL olarak girin",
  note: "Not en fazla 280 karakter olabilir",
};

const num = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? Number.NaN : Number(String(v).replace(",", ".")));

/** P3 ilan oluştur (FR-10). Başarılıysa ilanın sayfasına; ilk ilanlar moderasyona düşebilir (BR-11). */
export async function createLoadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const priceType = form.get("priceType");
  const parsed = createLoadSchema.safeParse({
    originDistrictId: num(form.get("originDistrictId")),
    destDistrictId: num(form.get("destDistrictId")),
    loadFrom: String(form.get("loadFrom") ?? ""),
    loadTo: String(form.get("loadTo") ?? ""),
    cargoType: form.get("cargoType"),
    weightTon: num(form.get("weightTon")),
    vehicleType: form.get("vehicleType"),
    bodyType: form.get("bodyType") || null,
    priceType,
    price: priceType === "sabit" ? num(form.get("price")) : null,
    note: String(form.get("note") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const key = String(i.path[0] ?? "");
      if (!(key in fields)) fields[key] = i.code === "custom" ? i.message : (FIELD_MESSAGES[key] ?? i.message);
    }
    return { error: "Formdaki işaretli alanları düzeltin.", fields };
  }

  let id: string;
  try {
    id = (await api<{ id: string }>("/loads", { method: "POST", body: parsed.data })).id;
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message, fields: e.fields };
    throw e;
  }
  redirect(`/panel/ilanlar/${id}?yeni=1`);
}

export interface PriceEstimate {
  distanceKm: number;
  min: number;
  max: number;
}

/** F7: güzergâh ve araç tipine göre tahmini fiyat aralığı (formdan, seçim değiştikçe). Hata olursa sessizce yok. */
export async function estimatePriceAction(from: number, to: number, vehicleType: string): Promise<PriceEstimate | null> {
  try {
    const q = new URLSearchParams({ from: String(from), to: String(to), vehicleType });
    return await api<PriceEstimate>(`/price-estimate?${q}`);
  } catch {
    return null;
  }
}

/** "Hâlâ geçerli" (F1, BR-02): ilan teyit edilir, son teyit yenilenir. */
export async function confirmLoadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "");
  try {
    await api(`/loads/${encodeURIComponent(id)}/confirm`, { method: "POST", body: { answer: "gecerli" } });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
  refresh();
  return {};
}

export interface BulkConfirmState {
  confirmed?: number;
  errors?: string[];
}

/** P4 toplu teyit: seçilenler ya da sayfadaki yayındaki ilanların hepsi; tek tek teyit edilir, biri hata verse diğerleri sürer. */
export async function bulkConfirmAction(_prev: BulkConfirmState, form: FormData): Promise<BulkConfirmState> {
  const ids = [...new Set(form.getAll(form.get("mode") === "all" ? "all" : "ids").map(String))].slice(0, 50);
  let confirmed = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try {
      await api(`/loads/${encodeURIComponent(id)}/confirm`, { method: "POST", body: { answer: "gecerli" } });
      confirmed++;
    } catch (e) {
      if (e instanceof ApiError) errors.push(e.message);
      else throw e;
    }
  }
  refresh();
  return { confirmed, errors };
}

/** İlanı kapat (FR-15): araç bulundu → kapandı, vazgeçildi → iptal. */
export async function closeLoadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "");
  const reason = form.get("reason") === "iptal" ? "iptal" : "arac_bulundu";
  try {
    await api(`/loads/${encodeURIComponent(id)}/close`, { method: "POST", body: { reason } });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
  refresh();
  return {};
}

export interface AcceptState extends FormState {
  /** Teslim kodu yalnız kabul yanıtında döner (DB'de hash): bir kez gösterilir, ayrıca SMS'le gider */
  deliveryCode?: string;
  jobId?: string;
}

/** Teklif kabul (FR-31, UC-09): iş oluşur, diğer teklifler reddedilir, ilan kapanır. */
export async function acceptOfferAction(_prev: AcceptState, form: FormData): Promise<AcceptState> {
  const offerId = String(form.get("offerId") ?? "");
  let r: { job: { id: string }; deliveryCode: string };
  try {
    r = await api(`/offers/${encodeURIComponent(offerId)}/accept`, { method: "POST" });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
  refresh();
  return { deliveryCode: r.deliveryCode, jobId: r.job.id };
}
