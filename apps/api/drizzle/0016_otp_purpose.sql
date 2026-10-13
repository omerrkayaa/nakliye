-- Amaç başına ayrı kod (giriş / hesap silme). Eski birincil anahtar 0000'da satır içi tanımlandı: Postgres adı otp_codes_pkey.
-- Mevcut (en çok 3 dk geçerli) kodlar giriş kodu sayılır.
ALTER TABLE "otp_codes" ADD COLUMN "purpose" varchar(8) DEFAULT 'giris' NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_codes" DROP CONSTRAINT "otp_codes_pkey";--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_phone_purpose_pk" PRIMARY KEY("phone","purpose");
