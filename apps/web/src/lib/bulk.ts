// FR-11 / F5 Excel ile toplu ilan: şablon üretimi ve yüklenen dosyanın okunması (yalnız sunucuda; dosya saklanmaz).
import ExcelJS from "exceljs";
import { BODY_TYPES, BULK_LOAD_MAX, CARGO_TYPES, createLoadSchema, loadDateError, VEHICLE_TYPES, type CreateLoadInput } from "@nakliye/shared";
import { dayRange } from "./format";
import type { Province } from "./types";

/** Şablon sütunları (sıra ve başlık metni). Okurken başlık metnine göre eşlenir: sütun sırası değişse de çalışır. */
export const COLUMNS = [
  { key: "originProvince", header: "Kalkış il", width: 14 },
  { key: "originDistrict", header: "Kalkış ilçe", width: 16 },
  { key: "destProvince", header: "Varış il", width: 14 },
  { key: "destDistrict", header: "Varış ilçe", width: 16 },
  { key: "loadFrom", header: "Yükleme başlangıç", width: 18 },
  { key: "loadTo", header: "Yükleme bitiş", width: 16 },
  { key: "cargoType", header: "Yük cinsi", width: 20 },
  { key: "weightTon", header: "Ağırlık (ton)", width: 13 },
  { key: "vehicleType", header: "Araç tipi", width: 12 },
  { key: "bodyType", header: "Kasa tipi", width: 14 },
  { key: "price", header: "Fiyat (₺)", width: 12 },
  { key: "note", header: "Not", width: 40 },
] as const;
type Key = (typeof COLUMNS)[number]["key"];

export const MAX_FILE_BYTES = 1_000_000;

const fold = (s: string) => s.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");

/**
 * Şablon: başlıklar, açılır listeler (yük cinsi, araç, kasa) ve açıklama sayfası. Örnek satır veri sayfasında
 * değil açıklamada: silinmeyi unutulan örnek gerçek ilan olarak yayınlanmasın.
 */
export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("İlanlar");
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const list = (values: Record<string, string>) => ({ type: "list" as const, allowBlank: true, formulae: [`"${Object.values(values).join(",")}"`] });
  for (let r = 2; r <= BULK_LOAD_MAX + 1; r++) {
    ws.getCell(r, 7).dataValidation = list(CARGO_TYPES);
    ws.getCell(r, 9).dataValidation = list(VEHICLE_TYPES);
    ws.getCell(r, 10).dataValidation = list(BODY_TYPES);
  }

  const help = wb.addWorksheet("Açıklama");
  help.getColumn(1).width = 100;
  [
    "Excel ile toplu ilan — nasıl doldurulur",
    `• Her satır bir ilan. En fazla ${BULK_LOAD_MAX} satır.`,
    "• İl ve ilçe Türkçe adıyla yazılır (ör. İstanbul / Esenyurt; il merkezi için ilçe adı ya da 'Merkez').",
    "• Tarihler GG.AA.YYYY (ör. 15.10.2026) ya da Excel tarih hücresi. Bitiş boşsa başlangıçla aynı gün sayılır.",
    "• Yük cinsi, araç tipi ve kasa tipi listeden seçilir. Kasa tipi boşsa 'fark etmez'.",
    "• Fiyat boşsa ilan teklif usulüdür; doluysa sabit fiyat (KDV hariç, TL).",
    "• Yüklemeden önce önizleme gösterilir; hatalı satırlar yayınlanmaz.",
    "",
    "Örnek satır: Manisa | Yunusemre | İzmir | Bornova | 15.10.2026 | 16.10.2026 | Palet | 12 | Kamyon | Tenteli | (boş: teklif) | Forklift var",
  ].forEach((t, i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = t;
    if (i === 0) cell.font = { bold: true, size: 13 };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface PreviewRow {
  /** Excel'deki satır numarası (başlık 1) */
  row: number;
  /** Tabloda gösterim */
  summary: { route: string; days: string; load: string; price: string };
  input: CreateLoadInput | null;
  errors: string[];
}

/** Hücre değerini metne çevir (zengin metin, formül sonucu, köprü) */
function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v) return text(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v).trim();
}

/** Excel tarih hücresi (exceljs UTC gece yarısı verir) ya da "GG.AA.YYYY" / "YYYY-AA-GG" metni → "YYYY-AA-GG" */
function day(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = text(v);
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  return null;
}

function number(v: ExcelJS.CellValue): number | null {
  if (typeof v === "number") return v;
  const s = text(v).replace(/\s|₺|tl/gi, "");
  if (!s) return null;
  // "24.000" (binlik) ya da "12,5" (ondalık)
  const n = Number(/^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/** Etiket ("Palet") ya da anahtar ("palet") → anahtar */
function option<K extends string>(values: Record<K, string>, s: string): K | null {
  const f = fold(s);
  for (const [k, label] of Object.entries(values) as [K, string][]) if (fold(label) === f || k === f) return k;
  return null;
}

/**
 * Yüklenen dosyayı oku ve satır satır doğrula (API'ye gitmeden önizleme). Hata mesajları Türkçe; son kontrol
 * yine API'de (tarih, moderasyon), çünkü önizleme ile yayın arasında gün değişebilir.
 */
export async function parseWorkbook(data: ArrayBuffer, provinces: Province[], now = new Date()): Promise<{ rows: PreviewRow[]; error?: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    return { rows: [], error: "Dosya okunamadı. Şablondaki gibi .xlsx dosyası yükleyin." };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], error: "Dosyada sayfa yok." };

  // Başlık satırı: metne göre sütun bul
  const col = new Map<Key, number>();
  ws.getRow(1).eachCell((cell, n) => {
    const c = COLUMNS.find((x) => fold(x.header) === fold(text(cell.value)));
    if (c) col.set(c.key, n);
  });
  const missing = COLUMNS.filter((c) => c.key !== "note" && c.key !== "bodyType" && c.key !== "price" && c.key !== "loadTo" && !col.has(c.key));
  if (missing.length) return { rows: [], error: `Başlık satırında eksik sütun: ${missing.map((c) => c.header).join(", ")}. Şablonu indirip kullanın.` };

  const provinceByName = new Map(provinces.map((p) => [fold(p.name), p]));
  const rows: PreviewRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: Key) => (col.has(k) ? row.getCell(col.get(k)!).value : null);
    if (COLUMNS.every((c) => text(get(c.key)) === "")) continue; // boş satır
    if (rows.length >= BULK_LOAD_MAX) return { rows: [], error: `Dosyada ${BULK_LOAD_MAX} satırdan fazla ilan var; bölerek yükleyin.` };

    const errors: string[] = [];
    const place = (pk: Key, dk: Key, label: string) => {
      const p = provinceByName.get(fold(text(get(pk))));
      if (!p) {
        errors.push(text(get(pk)) ? `${label} il bulunamadı: “${text(get(pk))}”` : `${label} ili boş`);
        return null;
      }
      const dName = fold(text(get(dk)));
      const d = p.districts.find((x) => fold(x.name) === dName);
      if (!d) errors.push(dName ? `${label} ilçe ${p.name} ilinde bulunamadı: “${text(get(dk))}”` : `${label} ilçesi boş`);
      return d ? { id: d.id, label: `${d.name}, ${p.name}` } : null;
    };
    const origin = place("originProvince", "originDistrict", "Kalkış");
    const dest = place("destProvince", "destDistrict", "Varış");

    const from = day(get("loadFrom"));
    if (!from) errors.push(text(get("loadFrom")) ? `Yükleme başlangıç tarihi anlaşılamadı: “${text(get("loadFrom"))}” (GG.AA.YYYY)` : "Yükleme başlangıç tarihi boş");
    const toRaw = get("loadTo");
    const to = text(toRaw) ? day(toRaw) : from;
    if (text(toRaw) && !to) errors.push(`Yükleme bitiş tarihi anlaşılamadı: “${text(toRaw)}”`);
    if (from && to) {
      const e = loadDateError(from, to, now);
      if (e) errors.push(e);
    }

    const cargoType = option(CARGO_TYPES, text(get("cargoType")));
    if (!cargoType) errors.push(text(get("cargoType")) ? `Yük cinsi tanınmadı: “${text(get("cargoType"))}”` : "Yük cinsi boş");
    const vehicleType = option(VEHICLE_TYPES, text(get("vehicleType")));
    if (!vehicleType) errors.push(text(get("vehicleType")) ? `Araç tipi tanınmadı: “${text(get("vehicleType"))}”` : "Araç tipi boş");
    const bodyText = text(get("bodyType"));
    const bodyType = bodyText ? option(BODY_TYPES, bodyText) : null;
    if (bodyText && !bodyType) errors.push(`Kasa tipi tanınmadı: “${bodyText}”`);

    const weight = number(get("weightTon"));
    if (weight === null || Number.isNaN(weight) || weight <= 0 || weight > 60) errors.push("Ağırlık 0–60 ton arasında bir sayı olmalı");
    const price = number(get("price"));
    if (price !== null && (Number.isNaN(price) || price <= 0)) errors.push("Fiyat pozitif bir sayı olmalı (boş bırakılırsa teklif usulü)");
    const note = text(get("note"));
    if (note.length > 280) errors.push("Not en fazla 280 karakter olabilir");

    let input: CreateLoadInput | null = null;
    if (errors.length === 0) {
      const parsed = createLoadSchema.safeParse({
        originDistrictId: origin!.id,
        destDistrictId: dest!.id,
        loadFrom: from,
        loadTo: to,
        cargoType,
        weightTon: weight,
        vehicleType,
        bodyType,
        priceType: price === null ? "teklif" : "sabit",
        price,
        note: note || undefined,
      });
      if (parsed.success) input = parsed.data;
      else errors.push(parsed.error.issues[0]?.message ?? "Satır geçersiz");
    }
    rows.push({
      row: r,
      summary: {
        route: `${origin?.label ?? text(get("originDistrict"))} → ${dest?.label ?? text(get("destDistrict"))}`,
        days: from ? dayRange(from, to ?? from) : "—",
        load: [cargoType ? CARGO_TYPES[cargoType] : text(get("cargoType")), weight && !Number.isNaN(weight) ? `${weight.toLocaleString("tr-TR")} ton` : "", vehicleType ? VEHICLE_TYPES[vehicleType] : ""].filter(Boolean).join(", "),
        price: price === null ? "Teklif usulü" : Number.isNaN(price) ? text(get("price")) : `${price.toLocaleString("tr-TR")} ₺`,
      },
      input,
      errors,
    });
  }
  if (rows.length === 0) return { rows: [], error: "Dosyada ilan satırı yok. Başlıkların altına en az bir satır yazın." };
  return { rows };
}
