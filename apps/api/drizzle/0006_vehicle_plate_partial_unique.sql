ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_plate_unique";--> statement-breakpoint
CREATE INDEX "capacity_vehicle_idx" ON "capacity_posts" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_plate_active_uq" ON "vehicles" USING btree ("plate") WHERE status <> 'silindi';--> statement-breakpoint
CREATE INDEX "vehicles_owner_idx" ON "vehicles" USING btree ("owner_user_id");