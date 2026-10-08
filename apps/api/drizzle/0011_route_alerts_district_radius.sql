-- route_alerts bu migration'da boştu (alarm uç noktası yoktu): NOT NULL sütunlar varsayılansız eklenebildi. İl → ilçe + yarıçap (2026-10-08 kararı).
ALTER TABLE "route_alerts" ADD COLUMN "origin_district_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "route_alerts" ADD COLUMN "origin_radius_km" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "route_alerts" ADD COLUMN "dest_district_id" integer;--> statement-breakpoint
ALTER TABLE "route_alerts" ADD COLUMN "dest_radius_km" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "route_alerts" ADD CONSTRAINT "route_alerts_origin_district_id_districts_id_fk" FOREIGN KEY ("origin_district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_alerts" ADD CONSTRAINT "route_alerts_dest_district_id_districts_id_fk" FOREIGN KEY ("dest_district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "route_alerts_user_idx" ON "route_alerts" USING btree ("user_id");