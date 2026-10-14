-- Belge yükleme 0018'e kadar yoktu: documents boş, varsayılansız NOT NULL sütunlar güvenli.
ALTER TABLE "documents" ADD COLUMN "content_type" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "size_bytes" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "expiry_handled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_user_id");