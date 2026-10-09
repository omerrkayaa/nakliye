import { Module } from "@nestjs/common";
import { MatchingModule } from "../matching/matching.module.js";
import { RatingsModule } from "../ratings/ratings.module.js";
import { ConfirmationService } from "./confirmation.service.js";
import { AdminLoadsController, LoadsController } from "./loads.controller.js";
import { LoadsService } from "./loads.service.js";
import { PublicConfirmController } from "./public-confirm.controller.js";
import { PublicLoadsController } from "./public-loads.controller.js";

@Module({
  imports: [MatchingModule, RatingsModule],
  controllers: [LoadsController, AdminLoadsController, PublicConfirmController, PublicLoadsController],
  providers: [LoadsService, ConfirmationService],
  exports: [LoadsService, ConfirmationService],
})
export class LoadsModule {}
