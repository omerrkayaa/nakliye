import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { ApiStatsService } from "./common/api-stats.service.js";
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
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // İstemci IP'si (OTP sınırı, NFR-04): X-Forwarded-For yalnız güvenilen vekilden gelirse dikkate alınır; aksi hâlde
  // başlığı uyduran IP sınırını aşardı. Varsayılan "loopback": aynı makinedeki web BFF (Next) ve ters vekil. Yayında
  // vekilin adresi/alt ağı verilir (TRUST_PROXY=10.0.0.0/8 gibi; "false" = hiç güvenme). Next, istemcinin gönderdiği
  // X-Forwarded-For'u ezmez: Next'in önünde gerçek adresi yazan bir ters vekil (nginx/Caddy) olmalı.
  const trust = process.env.TRUST_PROXY ?? "loopback";
  app.set("trust proxy", trust === "false" ? false : trust === "true" ? true : /^\d+$/.test(trust) ? Number(trust) : trust);
  app.setGlobalPrefix("api/v1");
  // NFR-09: her isteğin rota kalıbı, durum kodu ve süresi (yanıt bitince; Express eşleşen rotayı req.route'a yazar)
  const stats = app.get(ApiStatsService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = performance.now();
    res.on("finish", () => stats.record(req.method, (req.route as { path?: string } | undefined)?.path, res.statusCode, performance.now() - started));
    next();
  });
  // Kapanışta zamanlayıcı (pg-boss) düzgün dursun
  app.enableShutdownHooks();
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true });
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
