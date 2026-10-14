import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // .env yoksa ortam değişkenleri dışarıdan gelir
  }
  // Gizli anahtarlar (güvenlik incelemesi 2026-10-13): boşsa açılmaz; yayında .env.example'daki örnek değer de kabul edilmez.
  // OTP_PEPPER değişirse bekleyen giriş/teslim kodları ve silinen hesapların 60 günlük geri açma bağları geçersizleşir.
  for (const key of ["JWT_SECRET", "OTP_PEPPER"]) {
    const value = process.env[key];
    if (!value) throw new Error(`${key} tanımlı değil (.env.example'a bakın)`);
    if (process.env.NODE_ENV === "production" && value === "degistir-beni") throw new Error(`${key} örnek değerde; yayında güçlü, gizli bir değer verin`);
  }
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  // Kapanışta zamanlayıcı (pg-boss) düzgün dursun
  app.enableShutdownHooks();
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true });
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
