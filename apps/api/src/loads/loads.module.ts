import { Module } from "@nestjs/common";
import { PushService } from "../common/push.service.js";
import { ConfirmationService } from "./confirmation.service.js";
import { AdminLoadsController, LoadsController } from "./loads.controller.js";
import { LoadsService } from "./loads.service.js";
import { PublicConfirmController } from "./public-confirm.controller.js";

@Module({
  controllers: [LoadsController, AdminLoadsController, PublicConfirmController],
  providers: [LoadsService, ConfirmationService, PushService],
  exports: [ConfirmationService],
})
export class LoadsModule {}
