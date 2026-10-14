CREATE TABLE "mfa_challenges" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "totp_recovery_codes" (
	"user_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	CONSTRAINT "totp_recovery_codes_user_id_code_hash_pk" PRIMARY KEY("user_id","code_hash")
);
--> statement-breakpoint
CREATE TABLE "user_totp" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret_enc" text,
	"pending_enc" text,
	"enabled_at" timestamp with time zone,
	"last_step" bigint DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "mfa_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_recovery_codes" ADD CONSTRAINT "totp_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_totp" ADD CONSTRAINT "user_totp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mfa_challenges_user_idx" ON "mfa_challenges" USING btree ("user_id");