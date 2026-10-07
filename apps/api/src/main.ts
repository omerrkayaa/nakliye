import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // .env yoksa ortam değişkenleri dışarıdan gelir
  }
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true });
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
