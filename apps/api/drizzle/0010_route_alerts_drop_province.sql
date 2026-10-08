ALTER TABLE "route_alerts" DROP CONSTRAINT "route_alerts_origin_province_id_provinces_id_fk";
--> statement-breakpoint
ALTER TABLE "route_alerts" DROP CONSTRAINT "route_alerts_dest_province_id_provinces_id_fk";
--> statement-breakpoint
ALTER TABLE "route_alerts" DROP COLUMN "origin_province_id";--> statement-breakpoint
ALTER TABLE "route_alerts" DROP COLUMN "dest_province_id";