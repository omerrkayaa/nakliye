import { Module } from "@nestjs/common";
import { MatchingModule } from "../matching/matching.module.js";
import { ConfirmationService } from "./confirmation.service.js";
import { AdminLoadsController, LoadsController } from "./loads.controller.js";
import { LoadsService } from "./loads.service.js";
import { PublicConfirmController } from "./public-confirm.controller.js";

@Module({
  imports: [MatchingModule],
  controllers: [LoadsController, AdminLoadsController, PublicConfirmController],
  providers: [LoadsService, ConfirmationService],
  exports: [ConfirmationService],
})
export class LoadsModule {}
