ALTER TABLE "users" ADD COLUMN "phone_hmac" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_hmac_unique" UNIQUE("phone_hmac");