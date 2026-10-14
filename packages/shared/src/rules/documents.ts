import type { DocumentType, Role } from "../constants.js";

/**
 * Belge kuralları (FR-05, BR-10; 2026-10-12 kullanıcı kararları). Ruhsat ve sigorta araca bağlıdır (her araç için
 * ayrı); K belgesi, SRC ve vergi levhası kişiye. Vergi levhası yük sahibinin firmasınındır (onayı companies.verified_at).
 */
export const DOCUMENT_RULES: Record<DocumentType, { role: Exclude<Role, "admin">; perVehicle: boolean }> = {
  ruhsat: { role: "carrier", perVehicle: true },
  sigorta: { role: "carrier", perVehicle: true },
  k_belgesi: { role: "carrier", perVehicle: false },
  src: { role: "carrier", perVehicle: false },
  vergi_levhasi: { role: "shipper", perVehicle: false },
};

/** docs/04 §8: belgeler özel, 5 dk geçerli imzalı bağlantıyla açılır. Tür dosya adından değil ilk baytlardan anlaşılır. */
export const DOCUMENT_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  /** Kötüye kullanım (disk doldurma) sınırı: kullanıcı başına 24 saatte yükleme */
  uploadsPerDay: 20,
  urlTtlSec: 300,
} as const;

export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];
export const DOCUMENT_EXTENSIONS: Record<DocumentMimeType, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** Dosyanın gerçek türü ilk baytlarından (PDF "%PDF-", JPEG FF D8 FF, PNG imzası); izin verilmeyen türde null. */
export function detectDocumentType(head: Uint8Array): DocumentMimeType | null {
  const starts = (sig: number[]) => sig.length <= head.length && sig.every((b, i) => head[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

export interface VerificationInput {
  roles: readonly Role[];
  /** Onaylı belgeler; `expiresAt` TR günü ("2026-12-31") ya da süresiz */
  approved: readonly { type: DocumentType; vehicleId: string | null; expiresAt: string | null }[];
  /** Silinmemiş araçlar: silinen aracın ruhsatı sayılmaz */
  activeVehicleIds: readonly string[];
  /** Vergi levhası yönetici onaylı ve firma kimliği (unvan/vergi no) o günden beri değişmedi */
  companyVerified: boolean;
  /** Yük sahibi olarak tamamlanan iş */
  completedShipperJobs: number;
  /** Bugün, TR günü */
  today: string;
}

/**
 * BR-10 doğrulama seviyesi (0–2). Nakliyeci: 1 = etkin bir araç için geçerli ruhsat onaylı, 2 = + K belgesi + SRC.
 * Yük sahibi (2026-10-12 kararı): 1 = vergi levhası onaylı, 2 = + 3 tamamlanmış iş. Süresi geçen belge sayılmaz.
 * Kullanıcının tek seviyesi var (rozet, güven skoru, BR-11 moderasyonu): sahip olduğu rollerin en yükseği.
 */
export function verificationLevel(v: VerificationInput): 0 | 1 | 2 {
  const valid = (t: DocumentType) => v.approved.filter((d) => d.type === t && (d.expiresAt === null || d.expiresAt >= v.today));
  let carrier: 0 | 1 | 2 = 0;
  if (v.roles.includes("carrier") && valid("ruhsat").some((d) => d.vehicleId !== null && v.activeVehicleIds.includes(d.vehicleId))) {
    carrier = valid("k_belgesi").length > 0 && valid("src").length > 0 ? 2 : 1;
  }
  let shipper: 0 | 1 | 2 = 0;
  if (v.roles.includes("shipper") && v.companyVerified) shipper = v.completedShipperJobs >= 3 ? 2 : 1;
  return Math.max(carrier, shipper) as 0 | 1 | 2;
}
