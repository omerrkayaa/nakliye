import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { SchedulerService } from "./scheduler.service.js";

const QUEUE = "periodic-tick";

/**
 * Periyodik işler zamanlayıcısı (docs/04 §5 F1 teyidi, boş araç ilanı süresi…): pg-boss ile her 5 dakikada bir tur.
 * - Kuyruk `singleton`: aynı anda tek tur çalışır (birden fazla API örneği olsa bile).
 * - Açılışta bir tur hemen çalışır: API kapalıyken gecikmiş işler 5 dk daha beklemesin.
 * - JOBS_ENABLED=false ile kapatılır (testlerde turu elle tetiklemek için: POST /admin/tick).
 */
@Injectable()
export class PeriodicScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PeriodicScheduler.name);
  private boss?: PgBoss;

  constructor(private readonly scheduler: SchedulerService) {}

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
      const s = await this.scheduler.tick();
      if (Object.values(s).some((n) => n > 0)) {
        this.logger.log(
          `Tur: ${JSON.stringify(s)}`,
        );
      }
    });
    await boss.send(QUEUE, null);
    this.boss = boss;
    this.logger.log("Zamanlayıcı çalışıyor (her 5 dk)");
  }

  async onApplicationShutdown() {
    await this.boss?.stop({ graceful: true, timeout: 10_000 });
  }
}
