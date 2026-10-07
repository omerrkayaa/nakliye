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

export type CreateLoadInput = z.infer<typeof createLoadSchema>;
export type CreateCapacityInput = z.infer<typeof createCapacitySchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type LoadSearchInput = z.infer<typeof loadSearchSchema>;
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
