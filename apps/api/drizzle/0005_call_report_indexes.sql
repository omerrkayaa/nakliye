CREATE INDEX "call_logs_caller_time_idx" ON "call_logs" USING btree ("caller_id","created_at");--> statement-breakpoint
CREATE INDEX "call_logs_load_idx" ON "call_logs" USING btree ("load_post_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_time_idx" ON "reports" USING btree ("reporter_id","created_at");