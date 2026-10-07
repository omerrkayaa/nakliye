// Veri modeli — docs/04 §3
import {
  BODY_TYPES,
  CARGO_TYPES,
  DOCUMENT_TYPES,
  JOB_STATUSES,
  LOAD_STATUSES,
  REPORT_REASONS,
  ROLES,
  VEHICLE_TYPES,
} from "@nakliye/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [string, ...string[]];

export const roleEnum = pgEnum("role", ROLES);
export const vehicleTypeEnum = pgEnum("vehicle_type", keys(VEHICLE_TYPES));
export const bodyTypeEnum = pgEnum("body_type", keys(BODY_TYPES));
export const cargoTypeEnum = pgEnum("cargo_type", keys(CARGO_TYPES));
export const documentTypeEnum = pgEnum("document_type", keys(DOCUMENT_TYPES));
export const reportReasonEnum = pgEnum("report_reason", keys(REPORT_REASONS));
export const loadStatusEnum = pgEnum("load_status", LOAD_STATUSES);
export const jobStatusEnum = pgEnum("job_status", JOB_STATUSES);
export const reviewStatusEnum = pgEnum("review_status", ["bekliyor", "onay", "ret"]);
export const priceTypeEnum = pgEnum("price_type", ["sabit", "teklif"]);
export const offerStatusEnum = pgEnum("offer_status", ["beklemede", "kabul", "ret", "geri_cekildi"]);
export const confirmAnswerEnum = pgEnum("confirm_answer", ["gecerli", "arac_bulundu", "iptal", "cevapsiz"]);

/**
 * WGS84 (SRID 4326) nokta. drizzle'ın kendi `geometry()` tipi `srid` ayarını yok sayıyor: sütunu
 * `geometry(point)` (SRID 0) oluşturuyor ve değeri SRID'siz yazıyor. SRID'ler karışırsa PostGIS
 * "mixed SRID" hatası verir; bu tip hem sütunu hem değeri 4326 ile tanımlar. x = boylam, y = enlem.
 */
const point = customType<{ data: { x: number; y: number }; driverData: string }>({
  dataType: () => "geometry(Point,4326)",
  toDriver: ({ x, y }) => `SRID=4326;POINT(${x} ${y})`,
  // PostGIS hex EWKB döndürür: bayt sırası(1) + tip(4) [+ SRID(4)] + x(8) + y(8)
  fromDriver: (hex) => {
    const buf = Buffer.from(hex, "hex");
    const le = buf[0] === 1;
    const type = le ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
    const offset = type & 0x20000000 ? 9 : 5;
    const read = (o: number) => (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
    return { x: read(offset), y: read(offset + 8) };
  },
});
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ── Konum (statik veri) ─────────────────────────────────────────────
export const provinces = pgTable("provinces", {
  id: smallint("id").primaryKey(), // plaka kodu
  name: varchar("name", { length: 40 }).notNull(),
  geom: point("geom").notNull(),
});

export const districts = pgTable(
  "districts",
  {
    id: integer("id").primaryKey(),
    provinceId: smallint("province_id").notNull().references(() => provinces.id),
    name: varchar("name", { length: 60 }).notNull(),
    geom: point("geom").notNull(),
  },
  (t) => [index("districts_province_idx").on(t.provinceId), index("districts_geom_idx").using("gist", t.geom)],
);

// ── Kullanıcı ───────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 16 }).notNull().unique(),
  name: varchar("name", { length: 80 }),
  verificationLevel: smallint("verification_level").notNull().default(0),
  trustScore: real("trust_score").notNull().default(0.25),
  status: varchar("status", { length: 16 }).notNull().default("aktif"),
  createdAt: createdAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Bir kullanıcının tek firması olur (FR-03; API'de POST/PATCH /companies tekil)
  ownerUserId: uuid("owner_user_id").notNull().unique().references(() => users.id),
  title: varchar("title", { length: 160 }).notNull(),
  taxNo: varchar("tax_no", { length: 11 }),
  taxOffice: varchar("tax_office", { length: 80 }),
  address: text("address"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const otpCodes = pgTable("otp_codes", {
  phone: varchar("phone", { length: 16 }).primaryKey(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: smallint("attempts").notNull().default(0),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fcmToken: text("fcm_token").notNull().unique(),
  platform: varchar("platform", { length: 16 }).notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
});

// ── Araç ve belge ──────────────────────────────────────────────────
export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  plate: varchar("plate", { length: 12 }).notNull().unique(),
  vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
  bodyType: bodyTypeEnum("body_type").notNull(),
  capacityTon: numeric("capacity_ton", { precision: 5, scale: 2, mode: "number" }).notNull(),
  volumeM3: numeric("volume_m3", { precision: 6, scale: 2, mode: "number" }),
  status: varchar("status", { length: 16 }).notNull().default("aktif"),
  createdAt: createdAt(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    type: documentTypeEnum("type").notNull(),
    fileKey: text("file_key").notNull(),
    status: reviewStatusEnum("status").notNull().default("bekliyor"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    rejectReason: text("reject_reason"),
    expiresAt: date("expires_at"),
    createdAt: createdAt(),
  },
  (t) => [index("documents_status_idx").on(t.status)],
);

// ── İlanlar ────────────────────────────────────────────────────────
export const loadPosts = pgTable(
  "load_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareId: varchar("share_id", { length: 12 }).notNull().unique(), // WhatsApp paylaşım linki (F8)
    shipperId: uuid("shipper_id").notNull().references(() => users.id),
    originDistrictId: integer("origin_district_id").notNull().references(() => districts.id),
    originGeom: point("origin_geom").notNull(),
    destDistrictId: integer("dest_district_id").notNull().references(() => districts.id),
    destGeom: point("dest_geom").notNull(),
    loadFrom: date("load_from").notNull(),
    loadTo: date("load_to").notNull(),
    cargoType: cargoTypeEnum("cargo_type").notNull(),
    weightTon: numeric("weight_ton", { precision: 5, scale: 2, mode: "number" }).notNull(),
    vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
    bodyType: bodyTypeEnum("body_type"),
    priceType: priceTypeEnum("price_type").notNull(),
    price: numeric("price", { precision: 10, scale: 2, mode: "number" }),
    note: varchar("note", { length: 280 }),
    status: loadStatusEnum("status").notNull().default("teyitli"),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }).notNull().defaultNow(),
    nextReminderAt: timestamp("next_reminder_at", { withTimezone: true }).notNull(),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("load_posts_origin_geom_idx").using("gist", t.originGeom),
    index("load_posts_dest_geom_idx").using("gist", t.destGeom),
    index("load_posts_status_date_idx").on(t.status, t.loadFrom),
    index("load_posts_shipper_idx").on(t.shipperId),
    index("load_posts_reminder_idx").on(t.nextReminderAt).where(sql`status = 'teyitli'`),
  ],
);

export const loadConfirmations = pgTable("load_confirmations", {
  id: uuid("id").primaryKey().defaultRandom(),
  loadPostId: uuid("load_post_id").notNull().references(() => loadPosts.id, { onDelete: "cascade" }),
  askedAt: timestamp("asked_at", { withTimezone: true }).notNull().defaultNow(),
  pushOpenedAt: timestamp("push_opened_at", { withTimezone: true }),
  smsSentAt: timestamp("sms_sent_at", { withTimezone: true }),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  answer: confirmAnswerEnum("answer"),
  channel: varchar("channel", { length: 8 }),
});

export const capacityPosts = pgTable(
  "capacity_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => users.id),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    originDistrictId: integer("origin_district_id").notNull().references(() => districts.id),
    originGeom: point("origin_geom").notNull(),
    destDistrictId: integer("dest_district_id").references(() => districts.id), // null = her yer
    destGeom: point("dest_geom"),
    availableFrom: date("available_from").notNull(),
    availableTo: date("available_to").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("aktif"),
    createdAt: createdAt(),
  },
  (t) => [
    index("capacity_origin_geom_idx").using("gist", t.originGeom),
    index("capacity_status_date_idx").on(t.status, t.availableFrom),
  ],
);

export const routeAlerts = pgTable("route_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  originProvinceId: smallint("origin_province_id").references(() => provinces.id),
  destProvinceId: smallint("dest_province_id").references(() => provinces.id),
  vehicleType: vehicleTypeEnum("vehicle_type"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loadPostId: uuid("load_post_id").notNull().references(() => loadPosts.id, { onDelete: "cascade" }),
    capacityPostId: uuid("capacity_post_id").notNull().references(() => capacityPosts.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    outcome: varchar("outcome", { length: 16 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("matches_pair_uq").on(t.loadPostId, t.capacityPostId)],
);

// ── Teklif ve iş ───────────────────────────────────────────────────
export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loadPostId: uuid("load_post_id").notNull().references(() => loadPosts.id, { onDelete: "cascade" }),
    carrierId: uuid("carrier_id").notNull().references(() => users.id),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    price: numeric("price", { precision: 10, scale: 2, mode: "number" }).notNull(),
    note: varchar("note", { length: 280 }),
    status: offerStatusEnum("status").notNull().default("beklemede"),
    createdAt: createdAt(),
  },
  (t) => [index("offers_load_idx").on(t.loadPostId)],
);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  loadPostId: uuid("load_post_id").notNull().unique().references(() => loadPosts.id),
  offerId: uuid("offer_id").references(() => offers.id),
  shipperId: uuid("shipper_id").notNull().references(() => users.id),
  carrierId: uuid("carrier_id").notNull().references(() => users.id),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
  agreedPrice: numeric("agreed_price", { precision: 10, scale: 2, mode: "number" }),
  status: jobStatusEnum("status").notNull().default("anlasildi"),
  deliveryCodeHash: varchar("delivery_code_hash", { length: 64 }).notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  cancelledBy: uuid("cancelled_by").references(() => users.id),
  createdAt: createdAt(),
});

export const jobEvents = pgTable("job_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 32 }).notNull(),
  actorId: uuid("actor_id").references(() => users.id),
  meta: jsonb("meta"),
  createdAt: createdAt(),
});

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id),
    raterId: uuid("rater_id").notNull().references(() => users.id),
    rateeId: uuid("ratee_id").notNull().references(() => users.id),
    stars: smallint("stars").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'`),
    comment: varchar("comment", { length: 500 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ratings_job_rater_uq").on(t.jobId, t.raterId), index("ratings_ratee_idx").on(t.rateeId)],
);

// ── Güven ve moderasyon ────────────────────────────────────────────
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").notNull().references(() => users.id),
    targetType: varchar("target_type", { length: 16 }).notNull(),
    targetId: uuid("target_id").notNull(),
    reason: reportReasonEnum("reason").notNull(),
    note: varchar("note", { length: 500 }),
    status: varchar("status", { length: 16 }).notNull().default("acik"),
    resolution: text("resolution"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reports_once_uq").on(t.reporterId, t.targetType, t.targetId, t.reason),
    index("reports_target_idx").on(t.targetType, t.targetId),
  ],
);

export const callLogs = pgTable("call_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  callerId: uuid("caller_id").notNull().references(() => users.id),
  loadPostId: uuid("load_post_id").notNull().references(() => loadPosts.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const appParams = pgTable("app_params", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
