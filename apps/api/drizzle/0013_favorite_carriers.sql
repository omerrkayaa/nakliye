CREATE TABLE "favorite_carriers" (
	"shipper_id" uuid NOT NULL,
	"carrier_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_carriers_shipper_id_carrier_id_pk" PRIMARY KEY("shipper_id","carrier_id")
);
--> statement-breakpoint
ALTER TABLE "favorite_carriers" ADD CONSTRAINT "favorite_carriers_shipper_id_users_id_fk" FOREIGN KEY ("shipper_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_carriers" ADD CONSTRAINT "favorite_carriers_carrier_id_users_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorite_carriers_carrier_idx" ON "favorite_carriers" USING btree ("carrier_id");