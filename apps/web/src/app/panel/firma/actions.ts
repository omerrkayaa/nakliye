"use server";

import { refresh } from "next/cache";
import { api, ApiError } from "@/lib/api";

export interface ProfileState {
  error?: string;
  fields?: Record<string, string>;
  done?: boolean;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/**
 * P8: ad soyad (PATCH /me) + firma (ilk kez POST, sonra PATCH /companies). Firma alanlarında boş bırakılan isteğe
 * bağlı alan güncellemede silinir (null). Unvan boşsa ve firma yoksa firma oluşturulmaz (bireysel yük sahibi).
 */
export async function saveProfileAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const name = text(form, "name");
  const company = { title: text(form, "title"), taxNo: text(form, "taxNo"), taxOffice: text(form, "taxOffice"), address: text(form, "address") };
  const hasCompany = form.get("hasCompany") === "1";
  try {
    if (name) await api("/me", { method: "PATCH", body: { name } });
    if (hasCompany) {
      if (!company.title) return { error: "Firma unvanı boş olamaz", fields: { title: "Firma unvanını yazın" } };
      await api("/companies", {
        method: "PATCH",
        body: { title: company.title, taxNo: company.taxNo || null, taxOffice: company.taxOffice || null, address: company.address || null },
      });
    } else if (company.title) {
      await api("/companies", {
        method: "POST",
        body: { title: company.title, taxNo: company.taxNo || undefined, taxOffice: company.taxOffice || undefined, address: company.address || undefined },
      });
    }
  } catch (e) {
    if (e instanceof ApiError) return { error: Object.keys(e.fields).length ? "İşaretli alanları düzeltin" : e.message, fields: e.fields };
    throw e;
  }
  refresh();
  return { done: true };
}
