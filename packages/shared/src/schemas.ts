// API sözleşmesi: Android, Web ve API aynı şemaları kullanır (docs/04 §6).
import { z } from "zod";
import {
  BODY_TYPES,
  CARGO_TYPES,
  CONFIRMATION_ANSWERS,
  REPORT_REASONS,
  VEHICLE_TYPES,
  type BodyType,
  type CargoType,
  type ReportReason,
  type VehicleType,
} from "./constants.js";

const keysOf = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const vehicleTypeSchema = z.enum(keysOf(VEHICLE_TYPES)) as z.ZodType<VehicleType>;
export const bodyTypeSchema = z.enum(keysOf(BODY_TYPES)) as z.ZodType<BodyType>;
export const cargoTypeSchema = z.enum(keysOf(CARGO_TYPES)) as z.ZodType<CargoType>;
export const reportReasonSchema = z.enum(keysOf(REPORT_REASONS)) as z.ZodType<ReportReason>;

/** Türkiye cep telefonu; "0532 123 45 67", "+905321234567" gibi girişleri kabul eder, +905XXXXXXXXX'e çevirir. */
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s()-]/g, ""))
  .transform((s) => s.replace(/^(\+90|0090|90|0)/, ""))
  .refine((s) => /^5\d{9}$/.test(s), "Geçerli bir cep telefonu numarası girin")
  .transform((s) => `+90${s}`);

export const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG olmalı");

export const otpRequestSchema = z.object({ phone: phoneSchema });
export const otpVerifySchema = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) });

// ── Kullanıcı ve firma (FR-02, FR-03) ────────────────────────────────

/** T.C. kimlik no kontrol haneleri: 10. hane = (tekler×7 − çiftler) mod 10, 11. hane = ilk 10 hanenin toplamı mod 10. */
export function isValidTckn(s: string): boolean {
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = [...s].map(Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d[9] === d10 && d[10] === d11;
}

/**
 * Vergi numarası: tüzel kişide 10 haneli VKN, şahıs firmasında 11 haneli TCKN.
 * VKN için yalnız biçim kontrolü yapılır (kontrol algoritması doğrulanana kadar gerçek numarayı reddetmemek için);
 * asıl doğrulama yöneticinin firma onayıdır.
 */
export const taxNoSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ""))
  .refine((s) => /^\d{10}$/.test(s) || isValidTckn(s), "Vergi no 10 haneli VKN ya da geçerli 11 haneli T.C. kimlik no olmalı");

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} en az ${min} karakter olmalı`)
    .max(max, `${label} en fazla ${max} karakter olabilir`)
    // U+FFFD: istemci metni UTF-8 dışı kodlamayla gönderdi (ör. Windows curl'de "Ö" → "�"); sessizce bozuk kaydetme
    .refine((s) => !s.includes("�"), `${label} geçersiz karakter içeriyor (UTF-8 gönderin)`);

export const updateMeSchema = z.object({ name: trimmed(2, 80, "Ad soyad") });

/** Kullanıcı kendine yalnız nakliyeci / yük sahibi rolü ekleyebilir; yönetici rolü elle verilir. */
export const SELF_ROLES = ["carrier", "shipper"] as const;
export const addRolesSchema = z.object({ roles: z.array(z.enum(SELF_ROLES)).min(1, "En az bir rol seçin").max(2) });

export const createCompanySchema = z.object({
  title: trimmed(2, 160, "Unvan"),
  taxNo: taxNoSchema.optional(),
  taxOffice: trimmed(2, 80, "Vergi dairesi").optional(),
  address: trimmed(5, 500, "Adres").optional(),
});
/** Güncellemede isteğe bağlı alanlar null ile silinebilir (ör. yanlış girilmiş vergi no). */
export const updateCompanySchema = z
  .object({
    title: createCompanySchema.shape.title.optional(),
    taxNo: taxNoSchema.nullable().optional(),
    taxOffice: createCompanySchema.shape.taxOffice.nullable(),
    address: createCompanySchema.shape.address.nullable(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Değiştirilecek en az bir alan gönderin");

export const plateSchema = z
  .string()
  .transform((s) => s.toUpperCase().replace(/\s+/g, ""))
  .refine((s) => /^(0[1-9]|[1-7]\d|8[01])[A-Z]{1,3}\d{2,5}$/.test(s), "Geçerli bir plaka girin");

export const createVehicleSchema = z.object({
  plate: plateSchema,
  vehicleType: vehicleTypeSchema,
  bodyType: bodyTypeSchema,
  capacityTon: z.number().positive().max(60),
  volumeM3: z.number().positive().max(150).optional(),
});

export const createLoadSchema = z
  .object({
    originDistrictId: z.number().int().positive(),
    destDistrictId: z.number().int().positive(),
    loadFrom: isoDaySchema,
    loadTo: isoDaySchema,
    cargoType: cargoTypeSchema,
    weightTon: z.number().positive().max(60),
    vehicleType: vehicleTypeSchema,
    bodyType: bodyTypeSchema.nullable(),
    priceType: z.enum(["sabit", "teklif"]),
    price: z.number().positive().nullable(),
    note: z.string().max(280).optional(),
  })
  .refine((v) => v.loadFrom <= v.loadTo, { message: "Bitiş tarihi başlangıçtan önce olamaz", path: ["loadTo"] })
  .refine((v) => v.priceType === "teklif" || v.price !== null, { message: "Sabit fiyatta tutar zorunlu", path: ["price"] });

export const createCapacitySchema = z
  .object({
    vehicleId: z.string().uuid(),
    originDistrictId: z.number().int().positive(),
    destDistrictId: z.number().int().positive().nullable(),
    availableFrom: isoDaySchema,
    availableTo: isoDaySchema,
  })
  .refine((v) => v.availableFrom <= v.availableTo, { message: "Bitiş tarihi başlangıçtan önce olamaz", path: ["availableTo"] });

export const loadSearchSchema = z.object({
  fromProvinceId: z.coerce.number().int().optional(),
  toProvinceId: z.coerce.number().int().optional(),
  date: isoDaySchema.optional(),
  vehicleType: vehicleTypeSchema.optional(),
  near: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(),
  radiusKm: z.coerce.number().min(5).max(200).default(50),
  page: z.coerce.number().int().min(1).default(1),
});

export const confirmLoadSchema = z.object({ answer: z.enum(CONFIRMATION_ANSWERS) });

export const createOfferSchema = z.object({
  vehicleId: z.string().uuid(),
  price: z.number().positive(),
  note: z.string().max(280).optional(),
});

export const deliverJobSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export const createRatingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.string()).max(6).default([]),
  comment: z.string().max(500).optional(),
});

export const createReportSchema = z.object({
  targetType: z.enum(["load_post", "user"]),
  targetId: z.string().uuid(),
  reason: reportReasonSchema,
  note: z.string().max(500).optional(),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type AddRolesInput = z.infer<typeof addRolesSchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CreateLoadInput = z.infer<typeof createLoadSchema>;
export type CreateCapacityInput = z.infer<typeof createCapacitySchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type LoadSearchInput = z.infer<typeof loadSearchSchema>;
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
