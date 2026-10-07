import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { ConfirmationService } from "./confirmation.service.js";

const QUEUE = "confirmation-tick";

/**
 * F1 zamanlayıcısı (docs/04 §5): pg-boss ile her 5 dakikada bir teyit turu.
 * - Kuyruk `singleton`: aynı anda tek tur çalışır (birden fazla API örneği olsa bile).
 * - Açılışta bir tur hemen çalışır: API kapalıyken gecikmiş işler 5 dk daha beklemesin.
 * - JOBS_ENABLED=false ile kapatılır (testlerde turu elle tetiklemek için: POST /admin/jobs/confirmation-tick).
 */
@Injectable()
export class ConfirmationScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ConfirmationScheduler.name);
  private boss?: PgBoss;

  constructor(private readonly confirmation: ConfirmationService) {}

  async onApplicationBootstrap() {
    if (process.env.JOBS_ENABLED === "false") {
      this.logger.warn("Zamanlayıcı kapalı (JOBS_ENABLED=false)");
      return;
    }
    const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: "pgboss" });
    boss.on("error", (e: Error) => this.logger.error(`pg-boss: ${e.message}`));
    await boss.start();
    await boss.createQueue(QUEUE, { policy: "singleton" });
    await boss.schedule(QUEUE, "*/5 * * * *", null, { tz: "Europe/Istanbul" });
    await boss.work(QUEUE, async () => {
      const s = await this.confirmation.tick();
      if (s.statusChanged || s.reminded || s.smsSent) {
        this.logger.log(`Teyit turu: ${s.statusChanged} durum değişti, ${s.reminded} soru soruldu, ${s.smsSent} SMS`);
      }
    });
    await boss.send(QUEUE, null);
    this.boss = boss;
    this.logger.log("Teyit zamanlayıcısı çalışıyor (her 5 dk)");
  }

  async onApplicationShutdown() {
    await this.boss?.stop({ graceful: true, timeout: 10_000 });
  }
}
