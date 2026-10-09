// Koridor fiyat aralığı (F7) — docs/04 §7. Parametreler yönetici panelinden güncellenecek;
// buradaki değerler yalnızca başlangıç varsayımıdır [T] ve gerçek verilerle düzeltilmelidir.
import type { VehicleType } from "../constants.js";

export interface VehicleCostParams {
  fuelLitersPer100Km: number;
  /** Lastik, bakım, amortisman (₺/km) */
  wearPerKm: number;
  /** Şoför günlük maliyeti (₺) */
  driverDaily: number;
}

export interface PriceParams {
  fuelPricePerLiter: number;
  kmPerDay: number;
  marginMin: number;
  marginMax: number;
  roundTo: number;
  vehicles: Record<VehicleType, VehicleCostParams>;
}

export const DEFAULT_PRICE_PARAMS: PriceParams = {
  fuelPricePerLiter: 60,
  kmPerDay: 600,
  marginMin: 1.15,
  marginMax: 1.35,
  roundTo: 500,
  vehicles: {
    tir: { fuelLitersPer100Km: 33, wearPerKm: 9, driverDaily: 3000 },
    kirkayak: { fuelLitersPer100Km: 30, wearPerKm: 8, driverDaily: 2800 },
    kamyon: { fuelLitersPer100Km: 25, wearPerKm: 6, driverDaily: 2500 },
    kamyonet: { fuelLitersPer100Km: 14, wearPerKm: 3.5, driverDaily: 2000 },
    panelvan: { fuelLitersPer100Km: 10, wearPerKm: 2.5, driverDaily: 1800 },
  },
};

/**
 * Kuş uçuşu → karayolu mesafe katsayısı [T]. Yol motoru (OSRM vb.) yok; Türkiye'de şehirlerarası karayolu kuş uçuşunun
 * kabaca 1,2–1,4 katı. Gerçek iş fiyatları biriktikçe formülle birlikte düzeltilmeli (docs/04 §7).
 */
export const ROAD_FACTOR = 1.3;

export interface CorridorEstimate extends PriceEstimate {
  /** Tahmini karayolu mesafesi (km, yuvarlanmış) */
  distanceKm: number;
}

/** F7 koridor aralığı: ilçe merkezleri arası kuş uçuşu mesafe × ROAD_FACTOR üzerinden. Otoyol/köprü ücreti dahil değil. */
export function corridorEstimate(straightKm: number, vehicleType: VehicleType, p: PriceParams = DEFAULT_PRICE_PARAMS): CorridorEstimate {
  const distanceKm = Math.round(straightKm * ROAD_FACTOR);
  return { distanceKm, ...estimatePrice(distanceKm, vehicleType, 0, p) };
}

export interface PriceEstimate {
  cost: number;
  min: number;
  max: number;
}

export function estimatePrice(
  distanceKm: number,
  vehicleType: VehicleType,
  tollsTl = 0,
  p: PriceParams = DEFAULT_PRICE_PARAMS,
): PriceEstimate {
  const v = p.vehicles[vehicleType];
  const fuel = (distanceKm * v.fuelLitersPer100Km * p.fuelPricePerLiter) / 100;
  const days = Math.max(1, Math.ceil(distanceKm / p.kmPerDay));
  const cost = fuel + tollsTl + v.driverDaily * days + v.wearPerKm * distanceKm;
  const r = (n: number) => Math.round(n / p.roundTo) * p.roundTo;
  return { cost: Math.round(cost), min: r(cost * p.marginMin), max: r(cost * p.marginMax) };
}
