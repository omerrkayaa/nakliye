import { Module } from "@nestjs/common";
import { AlertsModule } from "../alerts/alerts.module.js";
import { MatchingController } from "./matching.controller.js";
import { MatchingService } from "./matching.service.js";

@Module({
  imports: [AlertsModule],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
