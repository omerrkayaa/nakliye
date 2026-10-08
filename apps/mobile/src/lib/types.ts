// API yanıtlarının mobilde kullanılan kısmı (apps/api servislerindeki view() çıktıları; web'deki types.ts'in nakliyeci tarafı).
import type { BodyType, CargoType, JobStatus, LoadStatus, Role, VehicleType } from "@nakliye/shared";

export interface Place {
  district: string;
  province: string;
}

export interface Me {
  id: string;
  phone: string;
  name: string | null;
  roles: Role[];
  verified: boolean;
  trustScore: number;
  company: { title: string } | null;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface Province {
  id: number;
  name: string;
}

/** Yük akışı ve yük detayı (GET /loads, GET /loads/:id — sahibi olmayanın gördüğü) */
export interface Load {
  id: string;
  status: LoadStatus;
  origin: Place;
  dest: Place;
  loadFrom: string;
  loadTo: string;
  cargoType: CargoType;
  weightTon: number;
  vehicleType: VehicleType;
  bodyType: BodyType | null;
  priceType: "sabit" | "teklif";
  price: number | null;
  note: string | null;
  lastConfirmedAt: string | null;
  distanceKm?: number;
  shipper: { displayName: string | null; verified: boolean; phoneMasked: string };
}

export interface Vehicle {
  id: string;
  plate: string;
  vehicleType: VehicleType;
  bodyType: BodyType;
  capacityTon: number;
}

/** Nakliyecinin verdiği teklif (GET /offers) */
export interface MyOffer {
  id: string;
  status: "beklemede" | "kabul" | "ret" | "geri_cekildi";
  price: number;
  note: string | null;
  createdAt: string;
  load: { id: string; status: LoadStatus; loadFrom: string; loadTo: string; weightTon: number; origin: Place; dest: Place };
}

/** Taşıma (iş) — GET /jobs, GET /jobs/:id */
export interface Job {
  id: string;
  role: "shipper" | "carrier";
  status: JobStatus;
  agreedPrice: number | null;
  load: { id: string; loadFrom: string; loadTo: string; cargoType: CargoType; weightTon: number; note: string | null; origin: Place; dest: Place };
  vehicle: { plate: string; vehicleType: VehicleType; bodyType: BodyType; capacityTon: number };
  /** Kabulden sonra numaralar karşılıklı açık (FR-32) */
  counterpart: { displayName: string | null; phone: string; verified: boolean };
  deliveryCodeAttemptsLeft: number;
  createdAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelReason: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}
