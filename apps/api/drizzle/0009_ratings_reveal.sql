ALTER TABLE "ratings" ADD COLUMN "revealed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ratings_unrevealed_idx" ON "ratings" USING btree ("job_id") WHERE revealed_at is null;