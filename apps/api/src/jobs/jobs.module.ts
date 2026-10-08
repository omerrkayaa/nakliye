import { Module } from "@nestjs/common";
import { LoadsModule } from "../loads/loads.module.js";
import { RatingsModule } from "../ratings/ratings.module.js";
import { JobsController, OffersController } from "./jobs.controller.js";
import { JobsService } from "./jobs.service.js";
import { OffersService } from "./offers.service.js";

/** Teklif → iş → teslim (FR-30…34). */
@Module({
  imports: [LoadsModule, RatingsModule],
  controllers: [OffersController, JobsController],
  providers: [OffersService, JobsService],
  exports: [OffersService, JobsService],
})
export class JobsModule {}
