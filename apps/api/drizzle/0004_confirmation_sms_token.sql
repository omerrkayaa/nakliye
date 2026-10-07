ALTER TABLE "load_confirmations" ADD COLUMN "sms_token_hash" varchar(64);--> statement-breakpoint
CREATE INDEX "load_confirmations_load_idx" ON "load_confirmations" USING btree ("load_post_id");--> statement-breakpoint
ALTER TABLE "load_confirmations" ADD CONSTRAINT "load_confirmations_sms_token_hash_unique" UNIQUE("sms_token_hash");