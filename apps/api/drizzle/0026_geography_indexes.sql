CREATE INDEX "capacity_origin_geog_idx" ON "capacity_posts" USING gist (("origin_geom"::geography));--> statement-breakpoint
CREATE INDEX "capacity_dest_geog_idx" ON "capacity_posts" USING gist (("dest_geom"::geography));--> statement-breakpoint
CREATE INDEX "load_posts_origin_geog_idx" ON "load_posts" USING gist (("origin_geom"::geography));--> statement-breakpoint
CREATE INDEX "load_posts_dest_geog_idx" ON "load_posts" USING gist (("dest_geom"::geography));