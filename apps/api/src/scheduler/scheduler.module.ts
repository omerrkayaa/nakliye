import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module.js";
import { LoadsModule } from "../loads/loads.module.js";
import { MatchingModule } from "../matching/matching.module.js";
import { RatingsModule } from "../ratings/ratings.module.js";
import { VehiclesModule } from "../vehicles/vehicles.module.js";
import { AdminSchedulerController } from "./scheduler.controller.js";
import { PeriodicScheduler } from "./periodic.scheduler.js";
import { SchedulerService } from "./scheduler.service.js";

/** Periyodik görevler (pg-boss). Yeni periyodik görev eklenince SchedulerService.tick'e bir adım eklenir. */
@Module({
  imports: [LoadsModule, VehiclesModule, MatchingModule, JobsModule, RatingsModule],
  controllers: [AdminSchedulerController],
  providers: [SchedulerService, PeriodicScheduler],
})
export class SchedulerModule {}
