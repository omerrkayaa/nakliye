ALTER TABLE "user_totp" ADD COLUMN "pending_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_totp" ADD COLUMN "pending_attempts" integer DEFAULT 0 NOT NULL;