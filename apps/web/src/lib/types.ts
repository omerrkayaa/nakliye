// API yanıtlarının web'de kullanılan kısmı (apps/api servislerindeki view() çıktıları).
import type { CargoType, LoadStatus, Role, VehicleType } from "@nakliye/shared";

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
