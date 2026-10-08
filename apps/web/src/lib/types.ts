// API yanıtlarının web'de kullanılan kısmı (apps/api servislerindeki view() çıktıları).
import type { BodyType, CargoType, LoadStatus, Role, VehicleType } from "@nakliye/shared";

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
  company: { title: string } | null;
}

export interface Province {
  id: number;
  name: string;
  districts: { id: number; name: string }[];
}

export interface LoadItem {
  id: string;
  status: LoadStatus;
  origin: Place;
  dest: Place;
  loadFrom: string;
  loadTo: string;
  cargoType: CargoType;
  weightTon: number;
  vehicleType: VehicleType;
  priceType: "sabit" | "teklif";
  price: number | null;
  lastConfirmedAt: string | null;
  createdAt: string;
  /** Yalnız sahibine: bekleyen teklif sayısı */
  pendingOffers: number;
}

/** Sahibin gördüğü ilan detayı (GET /loads/:id) */
export interface LoadDetail extends LoadItem {
  bodyType: BodyType | null;
  note: string | null;
  moderation: "bekliyor" | "onay" | "ret" | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}

/** SMS teyit linki (GET /public/confirm/:token) */
export interface PublicConfirm {
  origin: Place;
  dest: Place;
  loadFrom: string;
  loadTo: string;
  cargoType: CargoType;
  weightTon: number;
  vehicleType: VehicleType;
  priceType: "sabit" | "teklif";
  price: number | null;
  status: LoadStatus;
}
