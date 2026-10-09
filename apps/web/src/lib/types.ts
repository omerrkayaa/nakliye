// API yanıtlarının web'de kullanılan kısmı (apps/api servislerindeki view() çıktıları).
import type { BodyType, CargoType, JobStatus, LoadStatus, NotificationType, RatingTag, ReportReason, ReportStatus, Role, UserStatus, VehicleType } from "@nakliye/shared";

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
  /** Paylaşım sayfası kimliği (/ilan/<shareId>, F8) */
  shareId: string;
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
  origin: Place & { districtId: number; provinceId: number };
  dest: Place & { districtId: number; provinceId: number };
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
  events: { type: string; at: string; by: "shipper" | "carrier" | "system" | "admin"; meta: Record<string, unknown> | null }[];
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

/** Yönetici: moderasyondaki ilan (GET /admin/loads) — tam numarayla */
export interface AdminLoad extends LoadDetail {
  shipper: { displayName: string | null; verified: boolean; phoneMasked: string };
  shipperPhone: string;
}

export interface AdminUser {
  id: string;
  name: string | null;
  phone: string;
  status: UserStatus;
  trustScore: number;
  suspendedAt: string | null;
  suspendReason: string | null;
}

/** Yönetici: şikayet (GET /admin/reports) */
export interface AdminReport {
  id: string;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; name: string | null; phone: string };
  target: {
    type: "load_post" | "user";
    id: string;
    load: { status: LoadStatus; origin: Place; dest: Place } | null;
    owner: AdminUser | null;
  };
  openOnTarget: number;
}

/** Yönetici: tez metrikleri (GET /admin/metrics, Y5) */
export interface AdminMetrics {
  weeklyClosed: { week: string; closed: number }[];
  dailyLoads: { day: string; loads: number }[];
  live: { visible: number; fresh: number; freshness: number | null };
  confirmations: { windowDays: number; asked: number; answered: number; unanswered: number; open: number; answerRate: number | null; medianMinutes: number | null };
  matches: { windowDays: number; created: number; notified: number; converted: number; hitRate: number | null };
}

/** Yönetici: itirazlı taşıma (GET /admin/disputes) */
export interface AdminDispute {
  id: string;
  status: JobStatus;
  agreedPrice: number | null;
  load: { id: string; loadFrom: string; loadTo: string; cargoType: CargoType; weightTon: number; origin: Place; dest: Place };
  vehicle: { plate: string };
  shipper: { id: string; displayName: string | null; phone: string };
  carrier: { id: string; displayName: string | null; phone: string };
  deliveredAt: string | null;
  dispute: { reason: string | null; at: string } | null;
  decision: { outcome: "tamamlandi" | "iptal"; note: string | null; at: string } | null;
}

/** Bildirim kutusu (GET /notifications) — mobil lib/types.ts ile aynı */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: { type?: string; loadId?: string; jobId?: string; capacityId?: string; offerId?: string; alertId?: string; confirmationId?: string };
  createdAt: string;
  readAt: string | null;
}

/** Paylaşım sayfası (GET /public/loads/:shareId). Yayından kalkmışsa yalnız güzergâh ve durum. */
export type SharedLoad =
  | {
      shareId: string;
      status: "teyitli" | "teyit_bekliyor";
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
      shipper: { displayName: string | null; verified: boolean };
    }
  | { shareId: string; status: Exclude<LoadStatus, "teyitli" | "teyit_bekliyor">; origin: Place; dest: Place };
