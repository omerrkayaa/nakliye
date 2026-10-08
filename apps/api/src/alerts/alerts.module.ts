import { Module } from "@nestjs/common";
import { AlertsController } from "./alerts.controller.js";
import { AlertsService } from "./alerts.service.js";

/** Rota alarmları (FR-22). Bildirimleri eşleştirme gönderir (MatchingService.matchLoad). */
@Module({
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
