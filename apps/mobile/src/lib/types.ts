// API yanıtlarının mobilde kullanılan kısmı (apps/api servislerindeki view() çıktıları; web'deki types.ts'in nakliyeci tarafı).
import type { BodyType, CapacityStatus, CargoType, DocumentType, JobStatus, LoadStatus, NotificationType, RatingTag, Role, VehicleType } from "@nakliye/shared";

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
  /** Yalnız girişte: dondurulan hesap açıldı ya da silinen hesap süresi içinde geri açıldı */
  reopened?: "dondurma" | "silme";
}

export interface Province {
  id: number;
  name: string;
  districts: { id: number; name: string }[];
}

/** Yük akışı ve yük detayı (GET /loads, GET /loads/:id — sahibi olmayanın gördüğü) */
export interface Load {
  id: string;
  /** Paylaşım sayfası kimliği (web /ilan/<shareId>, F8) */
  shareId: string;
  status: LoadStatus;
  /** İlçe kimliği API yanıtında var (eski çevrimdışı kayıtta olmayabilir) */
  origin: Place & { districtId?: number };
  dest: Place & { districtId?: number };
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
  shipper: {
    displayName: string | null;
    verified: boolean;
    phoneMasked: string;
    /** Görünür puanların ortalaması (kör puanlama), puan sayısı, tamamlanan iş (A6 güven sinyali) */
    rating?: number | null;
    ratingCount?: number;
    completedJobs?: number;
  };
}

/** GET /return-plan/:jobId (F4, A10) */
export interface ReturnPlan {
  job: {
    id: string;
    status: JobStatus;
    origin: Place;
    dest: Place;
    loadFrom: string;
    loadTo: string;
    deliveredAt: string | null;
    vehicle: { plate: string; vehicleType: VehicleType; bodyType: BodyType; capacityTon: number };
    arrivalDay: string;
    window: { from: string; to: string };
    outboundKm: number;
    returnKm: number;
    /** "kus_ucusu": yol bilgisi alınamadı, rota üstü doğru çizgiyle (yaklaşık) */
    routeSource: "osrm" | "kus_ucusu";
  };
  returnLoads: (Load & { match: { score: number; originKm: number; destKm: number | null } })[];
  onRouteLoads: (Load & { route: { originDevKm: number; destDevKm: number; coverage: number } })[];
  alert: { originDistrictId: number; destDistrictId: number; vehicleType: VehicleType; exists: boolean };
}

/** GET /documents öğesi (FR-05) */
export interface MyDocument {
  id: string;
  type: DocumentType;
  vehicleId: string | null;
  plate: string | null;
  status: "bekliyor" | "onay" | "ret";
  rejectReason: string | null;
  expiresAt: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  vehicleType: VehicleType;
  bodyType: BodyType;
  capacityTon: number;
}

/** Boş araç ilanı (GET /capacity, GET /capacity/:id) — dest null = her yere giderim */
export interface Capacity {
  id: string;
  status: CapacityStatus;
  vehicle: Vehicle;
  origin: Place;
  dest: Place | null;
  availableFrom: string;
  availableTo: string;
  createdAt: string;
}

/** Boş araca uyan yük (GET /capacity/:id/matches) */
export interface CapacityMatch extends Omit<Load, "id" | "note" | "distanceKm"> {
  loadId: string;
  score: number;
  originKm: number;
  destKm: number | null;
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
  /** Kabulden sonra numaralar karşılıklı açık (FR-32); silinen hesapta (FR-07) numara yok */
  counterpart: { displayName: string | null; phone: string | null; verified: boolean };
  deliveryCodeAttemptsLeft: number;
  createdAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelReason: string | null;
}

export interface RatingView {
  stars: number;
  tags: RatingTag[];
  comment: string | null;
  at: string;
}

/** GET /jobs/:id — puan bloğuyla (kör puanlama: karşı tarafın puanı görünür olana kadar yalnız { revealed: false }) */
export interface JobDetail extends Job {
  rating: {
    deadline: string | null;
    canRate: boolean;
    given: RatingView | null;
    received: ({ revealed: true } & RatingView) | { revealed: false } | null;
  };
}

export interface Page<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}

/** F7 tahmini fiyat aralığı — GET /price-estimate */
export interface PriceEstimate {
  distanceKm: number;
  min: number;
  max: number;
  /** karayolu: OSRM; kus_ucusu: yol motoruna ulaşılamadı, kuş uçuşu × katsayı */
  source: "karayolu" | "kus_ucusu";
}

/** Rota alarmı (A8) — GET /alerts */
export interface RouteAlert {
  id: string;
  origin: Place & { districtId: number };
  originRadiusKm: number;
  dest: (Place & { districtId: number }) | null;
  destRadiusKm: number;
  vehicleType: VehicleType | null;
  active: boolean;
  createdAt: string;
}

/** Bildirim kutusu (A14) — GET /notifications */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: { type?: string; loadId?: string; jobId?: string; capacityId?: string; offerId?: string; alertId?: string; confirmationId?: string };
  createdAt: string;
  readAt: string | null;
}

/** Yük sahibinin kendi ilanı (GET /loads/mine, GET /loads/:id sahibi) */
export interface MyLoad extends Omit<Load, "shipper" | "distanceKm"> {
  origin: Place & { districtId: number };
  dest: Place & { districtId: number };
  createdAt: string;
  pendingOffers: number;
  moderation?: "bekliyor" | "onay" | "ret" | null;
}

/** Yük sahibinin ilanına gelen teklif (GET /loads/:id/offers) */
export interface IncomingOffer {
  id: string;
  status: "beklemede" | "kabul" | "ret" | "geri_cekildi";
  price: number;
  note: string | null;
  createdAt: string;
  vehicle: { vehicleType: VehicleType; bodyType: BodyType; capacityTon: number };
  carrier: { id: string; displayName: string | null; verified: boolean; rating: number | null; ratingCount: number; completedJobs: number };
}
