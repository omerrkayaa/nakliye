CREATE TABLE "district_routes" (
	"origin_district_id" integer NOT NULL,
	"dest_district_id" integer NOT NULL,
	"distance_m" integer NOT NULL,
	"duration_s" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "district_routes_origin_district_id_dest_district_id_pk" PRIMARY KEY("origin_district_id","dest_district_id")
);
--> statement-breakpoint
ALTER TABLE "district_routes" ADD CONSTRAINT "district_routes_origin_district_id_districts_id_fk" FOREIGN KEY ("origin_district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "district_routes" ADD CONSTRAINT "district_routes_dest_district_id_districts_id_fk" FOREIGN KEY ("dest_district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;