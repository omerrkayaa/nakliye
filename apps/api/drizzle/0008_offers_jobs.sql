ALTER TABLE "jobs" ADD COLUMN "delivery_code_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "job_events_job_idx" ON "job_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jobs_shipper_idx" ON "jobs" USING btree ("shipper_id");--> statement-breakpoint
CREATE INDEX "jobs_carrier_idx" ON "jobs" USING btree ("carrier_id");--> statement-breakpoint
CREATE INDEX "jobs_vehicle_idx" ON "jobs" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "jobs_delivered_idx" ON "jobs" USING btree ("delivered_at") WHERE status = 'teslim_edildi';--> statement-breakpoint
CREATE INDEX "offers_carrier_idx" ON "offers" USING btree ("carrier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_one_pending_uq" ON "offers" USING btree ("load_post_id","carrier_id") WHERE status = 'beklemede';