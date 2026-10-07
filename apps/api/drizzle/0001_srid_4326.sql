ALTER TABLE "capacity_posts" ALTER COLUMN "origin_geom" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("origin_geom", 4326);--> statement-breakpoint
ALTER TABLE "capacity_posts" ALTER COLUMN "dest_geom" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("dest_geom", 4326);--> statement-breakpoint
ALTER TABLE "districts" ALTER COLUMN "geom" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("geom", 4326);--> statement-breakpoint
ALTER TABLE "load_posts" ALTER COLUMN "origin_geom" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("origin_geom", 4326);--> statement-breakpoint
ALTER TABLE "load_posts" ALTER COLUMN "dest_geom" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("dest_geom", 4326);--> statement-breakpoint
ALTER TABLE "provinces" ALTER COLUMN "geom" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("geom", 4326);