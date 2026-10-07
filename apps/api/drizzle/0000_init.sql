CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."body_type" AS ENUM('tenteli', 'acik', 'kapali', 'frigo', 'damper', 'kayar_perde', 'lowbed');--> statement-breakpoint
CREATE TYPE "public"."cargo_type" AS ENUM('genel', 'palet', 'dokme', 'insaat', 'gida', 'soguk_zincir', 'makine', 'tarim', 'tehlikeli');--> statement-breakpoint
CREATE TYPE "public"."confirm_answer" AS ENUM('gecerli', 'arac_bulundu', 'iptal', 'cevapsiz');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('ruhsat', 'k_belgesi', 'src', 'sigorta', 'vergi_levhasi');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('anlasildi', 'yuklendi', 'yolda', 'teslim_edildi', 'tamamlandi', 'itirazli', 'iptal');--> statement-breakpoint
CREATE TYPE "public"."load_status" AS ENUM('taslak', 'moderasyonda', 'teyitli', 'teyit_bekliyor', 'suresi_doldu', 'kapandi', 'iptal');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('beklemede', 'kabul', 'ret', 'geri_cekildi');--> statement-breakpoint
CREATE TYPE "public"."price_type" AS ENUM('sabit', 'teklif');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('yuk_yok', 'telefon_acilmiyor', 'sahte', 'fiyat_farkli', 'diger');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('bekliyor', 'onay', 'ret');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('carrier', 'shipper', 'admin');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('tir', 'kirkayak', 'kamyon', 'kamyonet', 'panelvan');--> statement-breakpoint
CREATE TABLE "app_params" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caller_id" uuid NOT NULL,
	"load_post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capacity_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carrier_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"origin_district_id" integer NOT NULL,
	"origin_geom" geometry(point) NOT NULL,
	"dest_district_id" integer,
	"dest_geom" geometry(point),
	"available_from" date NOT NULL,
	"available_to" date NOT NULL,
	"status" varchar(16) DEFAULT 'aktif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"tax_no" varchar(11),
	"tax_office" varchar(80),
	"address" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fcm_token" text NOT NULL,
	"platform" varchar(16) NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_fcm_token_unique" UNIQUE("fcm_token")
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" integer PRIMARY KEY NOT NULL,
	"province_id" smallint NOT NULL,
	"name" varchar(60) NOT NULL,
	"geom" geometry(point) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"type" "document_type" NOT NULL,
	"file_key" text NOT NULL,
	"status" "review_status" DEFAULT 'bekliyor' NOT NULL,
	"reviewed_by" uuid,
	"reject_reason" text,
	"expires_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"actor_id" uuid,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"load_post_id" uuid NOT NULL,
	"offer_id" uuid,
	"shipper_id" uuid NOT NULL,
	"carrier_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"agreed_price" numeric(10, 2),
	"status" "job_status" DEFAULT 'anlasildi' NOT NULL,
	"delivery_code_hash" varchar(64) NOT NULL,
	"delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_load_post_id_unique" UNIQUE("load_post_id")
);
--> statement-breakpoint
CREATE TABLE "load_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"load_post_id" uuid NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"push_opened_at" timestamp with time zone,
	"sms_sent_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"answer" "confirm_answer",
	"channel" varchar(8)
);
--> statement-breakpoint
CREATE TABLE "load_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" varchar(12) NOT NULL,
	"shipper_id" uuid NOT NULL,
	"origin_district_id" integer NOT NULL,
	"origin_geom" geometry(point) NOT NULL,
	"dest_district_id" integer NOT NULL,
	"dest_geom" geometry(point) NOT NULL,
	"load_from" date NOT NULL,
	"load_to" date NOT NULL,
	"cargo_type" "cargo_type" NOT NULL,
	"weight_ton" numeric(5, 2) NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"body_type" "body_type",
	"price_type" "price_type" NOT NULL,
	"price" numeric(10, 2),
	"note" varchar(280),
	"status" "load_status" DEFAULT 'teyitli' NOT NULL,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_reminder_at" timestamp with time zone NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "load_posts_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"load_post_id" uuid NOT NULL,
	"capacity_post_id" uuid NOT NULL,
	"score" real NOT NULL,
	"notified_at" timestamp with time zone,
	"outcome" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"load_post_id" uuid NOT NULL,
	"carrier_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"note" varchar(280),
	"status" "offer_status" DEFAULT 'beklemede' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"phone" varchar(16) PRIMARY KEY NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"id" smallint PRIMARY KEY NOT NULL,
	"name" varchar(40) NOT NULL,
	"geom" geometry(point) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"rater_id" uuid NOT NULL,
	"ratee_id" uuid NOT NULL,
	"stars" smallint NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"comment" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" varchar(500),
	"status" varchar(16) DEFAULT 'acik' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"origin_province_id" smallint,
	"dest_province_id" smallint,
	"vehicle_type" "vehicle_type",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(16) NOT NULL,
	"name" varchar(80),
	"verification_level" smallint DEFAULT 0 NOT NULL,
	"trust_score" real DEFAULT 0.25 NOT NULL,
	"status" varchar(16) DEFAULT 'aktif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"plate" varchar(12) NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"body_type" "body_type" NOT NULL,
	"capacity_ton" numeric(5, 2) NOT NULL,
	"volume_m3" numeric(6, 2),
	"status" varchar(16) DEFAULT 'aktif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_plate_unique" UNIQUE("plate")
);
--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_load_post_id_load_posts_id_fk" FOREIGN KEY ("load_post_id") REFERENCES "public"."load_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_posts" ADD CONSTRAINT "capacity_posts_carrier_id_users_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_posts" ADD CONSTRAINT "capacity_posts_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_posts" ADD CONSTRAINT "capacity_posts_origin_district_id_districts_id_fk" FOREIGN KEY ("origin_district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_posts" ADD CONSTRAINT "capacity_posts_dest_district_id_districts_id_fk" FOREIGN KEY ("dest_district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_load_post_id_load_posts_id_fk" FOREIGN KEY ("load_post_id") REFERENCES "public"."load_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_shipper_id_users_id_fk" FOREIGN KEY ("shipper_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_carrier_id_users_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_confirmations" ADD CONSTRAINT "load_confirmations_load_post_id_load_posts_id_fk" FOREIGN KEY ("load_post_id") REFERENCES "public"."load_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_posts" ADD CONSTRAINT "load_posts_shipper_id_users_id_fk" FOREIGN KEY ("shipper_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_posts" ADD CONSTRAINT "load_posts_origin_district_id_districts_id_fk" FOREIGN KEY ("origin_district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_posts" ADD CONSTRAINT "load_posts_dest_district_id_districts_id_fk" FOREIGN KEY ("dest_district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_load_post_id_load_posts_id_fk" FOREIGN KEY ("load_post_id") REFERENCES "public"."load_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_capacity_post_id_capacity_posts_id_fk" FOREIGN KEY ("capacity_post_id") REFERENCES "public"."capacity_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_load_post_id_load_posts_id_fk" FOREIGN KEY ("load_post_id") REFERENCES "public"."load_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_carrier_id_users_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ratee_id_users_id_fk" FOREIGN KEY ("ratee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_alerts" ADD CONSTRAINT "route_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_alerts" ADD CONSTRAINT "route_alerts_origin_province_id_provinces_id_fk" FOREIGN KEY ("origin_province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_alerts" ADD CONSTRAINT "route_alerts_dest_province_id_provinces_id_fk" FOREIGN KEY ("dest_province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capacity_origin_geom_idx" ON "capacity_posts" USING gist ("origin_geom");--> statement-breakpoint
CREATE INDEX "capacity_status_date_idx" ON "capacity_posts" USING btree ("status","available_from");--> statement-breakpoint
CREATE INDEX "districts_province_idx" ON "districts" USING btree ("province_id");--> statement-breakpoint
CREATE INDEX "districts_geom_idx" ON "districts" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "load_posts_origin_geom_idx" ON "load_posts" USING gist ("origin_geom");--> statement-breakpoint
CREATE INDEX "load_posts_dest_geom_idx" ON "load_posts" USING gist ("dest_geom");--> statement-breakpoint
CREATE INDEX "load_posts_status_date_idx" ON "load_posts" USING btree ("status","load_from");--> statement-breakpoint
CREATE INDEX "load_posts_shipper_idx" ON "load_posts" USING btree ("shipper_id");--> statement-breakpoint
CREATE INDEX "load_posts_reminder_idx" ON "load_posts" USING btree ("next_reminder_at") WHERE status = 'teyitli';--> statement-breakpoint
CREATE UNIQUE INDEX "matches_pair_uq" ON "matches" USING btree ("load_post_id","capacity_post_id");--> statement-breakpoint
CREATE INDEX "offers_load_idx" ON "offers" USING btree ("load_post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_job_rater_uq" ON "ratings" USING btree ("job_id","rater_id");--> statement-breakpoint
CREATE INDEX "ratings_ratee_idx" ON "ratings" USING btree ("ratee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_once_uq" ON "reports" USING btree ("reporter_id","target_type","target_id","reason");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");