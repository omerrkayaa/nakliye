// API yanıtlarının web'de kullanılan kısmı (apps/api servislerindeki view() çıktıları).
import type { BodyType, CargoType, JobStatus, LoadStatus, RatingTag, Role, VehicleType } from "@nakliye/shared";

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

/** Yük sahibinin ilanına gelen teklif (GET /loads/:id/offers) — P5 karşılaştırma */
export interface Offer {
  id: string;
  status: "beklemede" | "kabul" | "ret" | "geri_cekildi";
  price: number;
  note: string | null;
  createdAt: string;
  vehicle: { vehicleType: VehicleType; bodyType: BodyType; capacityTon: number };
  carrier: {
    id: string;
    displayName: string | null;
    verified: boolean;
    /** Görünür puanların ortalaması; puan yoksa null */
    rating: number | null;
    ratingCount: number;
    completedJobs: number;
  };
}

/** Taşıma (iş) — GET /jobs, GET /jobs/:id (yük sahibinin gördüğü) */
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
  autoCompleteAt: string | null;
  cancelReason: string | null;
}

export interface RatingView {
  stars: number;
  tags: RatingTag[];
  comment: string | null;
  at: string;
}

export interface JobDetail extends Job {
  rating: {
    deadline: string | null;
    canRate: boolean;
    given: RatingView | null;
    /** Kör puanlama: karşı taraf puanladıysa ama görünür değilse yalnız { revealed: false } */
    received: ({ revealed: true } & RatingView) | { revealed: false } | null;
  };
  events: { type: string; at: string; by: "shipper" | "carrier" | "system"; meta: Record<string, unknown> | null }[];
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
