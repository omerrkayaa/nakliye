// Sektör sözlüğü: arayüzde ve API'de aynı değerler kullanılır (docs/02 §3 ilke 8).

export const ROLES = ["carrier", "shipper", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const VEHICLE_TYPES = {
  tir: "Tır",
  kirkayak: "Kırkayak",
  kamyon: "Kamyon",
  kamyonet: "Kamyonet",
  panelvan: "Panelvan",
} as const;
export type VehicleType = keyof typeof VEHICLE_TYPES;

export const BODY_TYPES = {
  tenteli: "Tenteli",
  acik: "Açık kasa",
  kapali: "Kapalı kasa",
  frigo: "Frigo",
  damper: "Damper",
  kayar_perde: "Kayar perde",
  lowbed: "Lowbed",
} as const;
export type BodyType = keyof typeof BODY_TYPES;

export const CARGO_TYPES = {
  genel: "Genel kargo",
  palet: "Palet",
  dokme: "Dökme",
  insaat: "İnşaat malzemesi",
  gida: "Gıda",
  soguk_zincir: "Soğuk zincir",
  makine: "Makine / ekipman",
  tarim: "Tarım ürünü",
  tehlikeli: "Tehlikeli madde (ADR)",
} as const;
export type CargoType = keyof typeof CARGO_TYPES;

// docs/03 §6 — yük ilanı durum diyagramı
export const LOAD_STATUSES = [
  "taslak",
  "moderasyonda",
  "teyitli",
  "teyit_bekliyor",
  "suresi_doldu",
  "kapandi",
  "iptal",
] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];
/** Araç: silinen araç kaydı silinmez (ilan/iş geçmişi), "silindi" olur. */
export const VEHICLE_STATUSES = ["aktif", "silindi"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

/** Boş araç ilanı (FR-12) */
export const CAPACITY_STATUSES = ["aktif", "kapandi", "iptal", "suresi_doldu"] as const;
export type CapacityStatus = (typeof CAPACITY_STATUSES)[number];
export const CAPACITY_STATUS_LABELS: Record<CapacityStatus, string> = {
  aktif: "Aktif",
  kapandi: "Doldu",
  iptal: "İptal",
  suresi_doldu: "Süresi doldu",
};

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  taslak: "Taslak",
  moderasyonda: "Onay bekliyor",
  teyitli: "Teyitli",
  teyit_bekliyor: "Teyit bekliyor",
  suresi_doldu: "Süresi doldu",
  kapandi: "Kapandı",
  iptal: "İptal",
};

// docs/03 §6 — iş (taşıma) durum diyagramı
export const JOB_STATUSES = [
  "anlasildi",
  "yuklendi",
  "yolda",
  "teslim_edildi",
  "tamamlandi",
  "itirazli",
  "iptal",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const CONFIRMATION_ANSWERS = ["gecerli", "arac_bulundu", "iptal"] as const;
export type ConfirmationAnswer = (typeof CONFIRMATION_ANSWERS)[number];

export const REPORT_REASONS = {
  yuk_yok: "Yük yok / gitmiş",
  telefon_acilmiyor: "Telefon açılmıyor",
  sahte: "Sahte ilan",
  fiyat_farkli: "Fiyat ilandakinden farklı",
  diger: "Diğer",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

export const DOCUMENT_TYPES = {
  ruhsat: "Araç ruhsatı",
  k_belgesi: "K yetki belgesi",
  src: "SRC belgesi",
  sigorta: "Sigorta poliçesi",
  vergi_levhasi: "Vergi levhası",
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const RATING_TAGS = {
  zamaninda: "Zamanında",
  iletisim_iyi: "İletişimi iyi",
  odeme_sorunsuz: "Ödeme sorunsuz",
  yuk_ozenli: "Yüke özenli",
  gec_kaldi: "Geç kaldı",
  fiyat_degisti: "Fiyat değişti",
} as const;
export type RatingTag = keyof typeof RATING_TAGS;
