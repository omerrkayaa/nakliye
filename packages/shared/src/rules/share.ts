import { CARGO_TYPES, VEHICLE_TYPES, type CargoType, type VehicleType } from "../constants.js";

// FR-16 / F8: WhatsApp ve diğer uygulamalara paylaşım metni (mobil ve web aynı metni üretir).
// Intl kullanılmaz: Android'deki Hermes motorunda tr-TR tarih/sayı biçimi garanti değil.

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** "2026-10-09" → "9 Eki" */
export function shortDay(isoDay: string): string {
  const [, m, d] = isoDay.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/** 24000 → "24.000" */
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export interface ShareableLoad {
  origin: { district: string; province: string };
  dest: { district: string; province: string };
  loadFrom: string;
  loadTo: string;
  cargoType: CargoType;
  weightTon: number;
  vehicleType: VehicleType;
  priceType: "sabit" | "teklif";
  price: number | null;
}

/** Paylaşım metni: güzergâh (WhatsApp'ta kalın), tarih, yük, fiyat, bağlantı. Numara yazılmaz (BR-40). */
export function loadShareText(l: ShareableLoad, url: string): string {
  const day = l.loadFrom === l.loadTo ? shortDay(l.loadFrom) : `${shortDay(l.loadFrom)} – ${shortDay(l.loadTo)}`;
  const price = l.priceType === "sabit" && l.price !== null ? `${thousands(l.price)} ₺` : "Teklif usulü";
  const weight = String(l.weightTon).replace(".", ",");
  return [
    `*${l.origin.district}, ${l.origin.province} → ${l.dest.district}, ${l.dest.province}*`,
    `Yükleme: ${day}`,
    `${weight} ton ${CARGO_TYPES[l.cargoType]} · ${VEHICLE_TYPES[l.vehicleType]}`,
    `Fiyat: ${price}`,
    `Teyitli ilan, ayrıntı: ${url}`,
  ].join("\n");
}

/** Paylaşım sayfasının yolu (web): /ilan/<shareId> */
export const sharePath = (shareId: string) => `/ilan/${shareId}`;
