// API sözleşmesi: Android, Web ve API aynı şemaları kullanır (docs/04 §6).
import { z } from "zod";
import { ROUTE_ALERT_PARAMS as RA } from "./rules/matching.js";
import {
  BODY_TYPES,
  CARGO_TYPES,
  CONFIRMATION_ANSWERS,
  DOCUMENT_TYPES,
  RATING_TAGS,
  REPORT_REASONS,
  VEHICLE_TYPES,
  type BodyType,
  type CargoType,
  type RatingTag,
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

/** Sayfa numarası: üst sınırsız değer OFFSET'te bigint'i taşırıp 500 veriyordu (2026-10-15); 10.000 × 20 = 200.000 kayıt */
const pageField = z.coerce.number().int().min(1).max(10_000, "Sayfa en çok 10.000 olabilir").default(1);

export const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG olmalı");

export const otpRequestSchema = z.object({ phone: phoneSchema });
export const otpVerifySchema = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) });
/** Yönetici ikinci adımı (NFR-04): doğrulama uygulamasındaki 6 hane ya da bir kurtarma kodu (ABCDE-FGH23) */
const secondFactorCode = z.string().trim().min(6, "Uygulamadaki 6 haneli kodu ya da bir kurtarma kodunu girin").max(20, "Kod en çok 20 karakter");
export const totpLoginSchema = z.object({ challenge: z.string().min(20).max(100), code: secondFactorCode });
export const totpCodeSchema = z.object({ code: secondFactorCode });
/** Kurulu hesapta (cihaz değiştirme) mevcut uygulamadan kod istenir */
export const totpSetupSchema = z.object({ code: secondFactorCode.optional() });
/** Hesap silme (FR-07): geri dönüşü olmadığı için hesabın numarasına giden kodla yeniden doğrulanır. */
export const deleteAccountSchema = z.object({ code: z.string().regex(/^\d{6}$/, "6 haneli kodu girin") });

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
    /** Herkese açık nakliyeci profili (yalnız nakliyeci açabilir; telefon ve kişi adı gösterilmez) */
    publicProfile: z.boolean().optional(),
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

/** Araç düzenleme: plaka değiştirilemez (başka araç demektir; silip yenisini ekleyin). */
export const updateVehicleSchema = z
  .object({
    vehicleType: vehicleTypeSchema,
    bodyType: bodyTypeSchema,
    capacityTon: z.number().positive().max(60),
    volumeM3: z.number().positive().max(150).nullable(),
  })
  .strict("Bu alan düzenlenemez (plaka değişecekse aracı silip yenisini ekleyin)")
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Değiştirilecek en az bir alan gönderin");

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

/** FR-11 Excel ile toplu ilan: tek istekte en fazla BULK_LOAD_MAX satır. Satırlar serviste tek tek doğrulanır
 * (biri hatalıysa diğerleri yine açılır), bu yüzden burada yalnız dizi sınırı. */
export const BULK_LOAD_MAX = 100;
export const bulkLoadSchema = z.object({
  items: z.array(z.unknown()).min(1, "En az bir satır gönderin").max(BULK_LOAD_MAX, `Tek seferde en fazla ${BULK_LOAD_MAX} ilan`),
});

/**
 * İlan düzenleme: kalkış/varış değiştirilemez (başka bir ilan olur, eşleşmeler bozulur).
 * Tarih/fiyat tutarlılığı API'de mevcut ilanla birleştirilip createLoadSchema ile yeniden denetlenir.
 */
export const updateLoadSchema = z
  .object({
    loadFrom: isoDaySchema,
    loadTo: isoDaySchema,
    cargoType: cargoTypeSchema,
    weightTon: z.number().positive().max(60),
    vehicleType: vehicleTypeSchema,
    bodyType: bodyTypeSchema.nullable(),
    priceType: z.enum(["sabit", "teklif"]),
    price: z.number().positive().nullable(),
    note: z.string().max(280).nullable(),
  })
  .strict("Bu alan düzenlenemez (kalkış/varış değişecekse ilanı kapatıp yenisini verin)")
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Değiştirilecek en az bir alan gönderin");

/** FR-15: ilanı kapat — araç bulundu ya da vazgeçildi. */
export const closeLoadSchema = z.object({ reason: z.enum(["arac_bulundu", "iptal"]) });

/** BR-11: yönetici moderasyon kararı. */
export const reviewLoadSchema = z.object({ decision: z.enum(["onay", "ret"]) });

export const pageSchema = z.object({ page: pageField });

export const createCapacitySchema = z
  .object({
    vehicleId: z.string().uuid(),
    originDistrictId: z.number().int().positive(),
    destDistrictId: z.number().int().positive().nullable(),
    availableFrom: isoDaySchema,
    availableTo: isoDaySchema,
  })
  .refine((v) => v.availableFrom <= v.availableTo, { message: "Bitiş tarihi başlangıçtan önce olamaz", path: ["availableTo"] });

/** Boş araç ilanı düzenleme: yükün aksine kalkış değişebilir (araç başka yerde boşalacaksa). Araç değiştirilemez. */
export const updateCapacitySchema = z
  .object({
    originDistrictId: z.number().int().positive(),
    destDistrictId: z.number().int().positive().nullable(),
    availableFrom: isoDaySchema,
    availableTo: isoDaySchema,
  })
  .strict("Bu alan düzenlenemez (araç değişecekse ilanı kapatıp yenisini verin)")
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Değiştirilecek en az bir alan gönderin");

/** Boş araç ilanını kapat: araç doldu ya da vazgeçildi. */
export const closeCapacitySchema = z.object({ reason: z.enum(["doldu", "iptal"]) });

export const loadSearchSchema = z.object({
  fromProvinceId: z.coerce.number().int().optional(),
  toProvinceId: z.coerce.number().int().optional(),
  date: isoDaySchema.optional(),
  vehicleType: vehicleTypeSchema.optional(),
  bodyType: bodyTypeSchema.optional(),
  /** Aracın taşıyabileceği en fazla tonaj: bundan ağır yükler gelmez (FR-20) */
  maxWeightTon: z.coerce.number().positive().max(60).optional(),
  /** "enlem,boylam" — yakınımdakiler (FR-21) */
  near: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "Konum 'enlem,boylam' biçiminde olmalı")
    .transform((s) => {
      const [lat, lng] = s.split(",").map(Number) as [number, number];
      return { lat, lng };
    })
    .refine((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180, "Geçersiz konum")
    .optional(),
  radiusKm: z.coerce.number().min(5).max(200).default(50),
  page: pageField,
});

export const confirmLoadSchema = z.object({ answer: z.enum(CONFIRMATION_ANSWERS) });

export const createOfferSchema = z.object({
  vehicleId: z.string().uuid(),
  price: z.number().positive().max(1_000_000),
  note: z.string().trim().max(280).optional(),
});

/** Nakliyecinin ara durum güncellemesi; teslim yalnız kodla (deliverJobSchema). */
export const jobStatusSchema = z.object({ status: z.enum(["yuklendi", "yolda"]) });

/** İptal ve itirazda sebep zorunlu (iptal oranı ve yönetici incelemesi için). */
const reasonSchema = z.object({ reason: z.string().trim().min(5, "Sebebi en az 5 karakterle yazın").max(500) });
export const cancelJobSchema = reasonSchema;
export const disputeJobSchema = reasonSchema;

export const jobListSchema = z.object({
  /** active: sürenler (teslim edildi dahil), past: tamamlanan/iptal/itirazlı */
  scope: z.enum(["active", "past"]).default("active"),
  page: pageField,
});

export const deliverJobSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/** FR-40. Etiketin puanlanan tarafa uygunluğu serviste (RATING_TAGS_FOR); tekrar eden etiket teke indirilir. */
export const createRatingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  tags: z
    .array(z.enum(keysOf(RATING_TAGS)) as z.ZodType<RatingTag>)
    .max(Object.keys(RATING_TAGS).length)
    .default([])
    .transform((t) => [...new Set(t)]),
  comment: z.string().trim().max(500).optional(),
});

const radiusSchema = z.number().int().min(RA.minRadiusKm).max(RA.maxRadiusKm);

/** Rota alarmı (FR-22): nereden (ilçe ± km) → nereye (ilçe ± km ya da null = her yer) + isteğe bağlı araç tipi. */
export const createRouteAlertSchema = z.object({
  originDistrictId: z.number().int().positive(),
  originRadiusKm: radiusSchema.default(RA.defaultOriginRadiusKm),
  destDistrictId: z.number().int().positive().nullable().default(null),
  destRadiusKm: radiusSchema.default(RA.defaultDestRadiusKm),
  vehicleType: vehicleTypeSchema.nullable().default(null),
});

export const updateRouteAlertSchema = z
  .object({
    originDistrictId: z.number().int().positive(),
    originRadiusKm: radiusSchema,
    destDistrictId: z.number().int().positive().nullable(),
    destRadiusKm: radiusSchema,
    vehicleType: vehicleTypeSchema.nullable(),
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Değiştirilecek alan yok");

export const createReportSchema = z.object({
  targetType: z.enum(["load_post", "user"]),
  targetId: z.string().uuid(),
  reason: reportReasonSchema,
  note: z.string().trim().max(500).optional(),
});

/** FR-51 yönetici: şikayeti sonuçlandır (not isteğe bağlı, kayıtta kalır). */
export const resolveReportSchema = z.object({
  decision: z.enum(["hakli", "haksiz"]),
  note: z.string().trim().max(500).optional(),
});
export const adminReportListSchema = z.object({
  status: z.enum(["acik", "kapali"]).default("acik"),
  page: pageField,
});
/** Yönetici itiraz kararı (BR-32 sonrası): teslim geçerli → tamamlandı, geçersiz → iptal. Not zorunlu (iki tarafa gider). */
export const resolveDisputeSchema = z.object({
  outcome: z.enum(["tamamlandi", "iptal"]),
  note: z.string().trim().min(5, "Kararın gerekçesini en az 5 karakterle yazın").max(500),
});
export const adminDisputeListSchema = adminReportListSchema;
/** FR-05 belge yükleme (çok parçalı formun metin alanları; dosya ayrı). Araca bağlı türde araç zorunlu (DOCUMENT_RULES). */
export const uploadDocumentSchema = z.object({
  type: z.enum(keysOf(DOCUMENT_TYPES), { message: "Belge türünü seçin" }),
  vehicleId: z.string().uuid().optional(),
});
/** FR-50 yönetici kararı: ret sebebi zorunlu (sahibine gider); onayda isteğe bağlı geçerlilik sonu (sigorta vb.) */
export const reviewDocumentSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("onay"), expiresAt: isoDaySchema.optional() }),
  z.object({ decision: z.literal("ret"), rejectReason: z.string().trim().min(5, "Ret sebebini en az 5 karakterle yazın").max(500) }),
]);
export const adminDocumentListSchema = z.object({
  status: z.enum(["bekliyor", "onay", "ret"]).default("bekliyor"),
  page: pageField,
});
/** F7 fiyat aralığı sorgusu: kalkış ve varış ilçesi + araç tipi */
export const priceEstimateSchema = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
  vehicleType: vehicleTypeSchema,
});
/** FR-51 yönetici: hesabı askıya al (sebep zorunlu; kayıtta kalır). */
export const suspendUserSchema = z.object({ reason: z.string().trim().min(5, "Sebebi en az 5 karakterle yazın").max(500) });

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type TotpLoginInput = z.infer<typeof totpLoginSchema>;
export type TotpCodeInput = z.infer<typeof totpCodeSchema>;
export type TotpSetupInput = z.infer<typeof totpSetupSchema>;
export type AddRolesInput = z.infer<typeof addRolesSchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CreateLoadInput = z.infer<typeof createLoadSchema>;
export type UpdateLoadInput = z.infer<typeof updateLoadSchema>;
export type CloseLoadInput = z.infer<typeof closeLoadSchema>;
export type ReviewLoadInput = z.infer<typeof reviewLoadSchema>;
export type ConfirmLoadInput = z.infer<typeof confirmLoadSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type CreateRatingInput = z.infer<typeof createRatingSchema>;
export type CreateRouteAlertInput = z.infer<typeof createRouteAlertSchema>;
export type UpdateRouteAlertInput = z.infer<typeof updateRouteAlertSchema>;
export type JobStatusInput = z.infer<typeof jobStatusSchema>;
export type ReasonInput = z.infer<typeof reasonSchema>;
export type JobListInput = z.infer<typeof jobListSchema>;
export type DeliverJobInput = z.infer<typeof deliverJobSchema>;
export type CreateCapacityInput = z.infer<typeof createCapacitySchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type UpdateCapacityInput = z.infer<typeof updateCapacitySchema>;
export type CloseCapacityInput = z.infer<typeof closeCapacitySchema>;
export type LoadSearchInput = z.infer<typeof loadSearchSchema>;
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
export type AdminReportListInput = z.infer<typeof adminReportListSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
export type PriceEstimateInput = z.infer<typeof priceEstimateSchema>;
export type BulkLoadInput = z.infer<typeof bulkLoadSchema>;
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type ReviewDocumentInput = z.infer<typeof reviewDocumentSchema>;
export type AdminDocumentListInput = z.infer<typeof adminDocumentListSchema>;
