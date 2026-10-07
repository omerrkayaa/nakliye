import { Module } from "@nestjs/common";
import { PushService } from "../common/push.service.js";
import { ConfirmationScheduler } from "./confirmation.scheduler.js";
import { ConfirmationService } from "./confirmation.service.js";
import { AdminJobsController, AdminLoadsController, LoadsController } from "./loads.controller.js";
import { LoadsService } from "./loads.service.js";
import { PublicConfirmController } from "./public-confirm.controller.js";

@Module({
  controllers: [LoadsController, AdminLoadsController, AdminJobsController, PublicConfirmController],
  providers: [LoadsService, ConfirmationService, ConfirmationScheduler, PushService],
  exports: [ConfirmationService],
})
export class LoadsModule {}
