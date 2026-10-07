import { Module } from "@nestjs/common";
import { LoadsModule } from "../loads/loads.module.js";
import { VehiclesModule } from "../vehicles/vehicles.module.js";
import { AdminJobsController } from "./jobs.controller.js";
import { JobsScheduler } from "./jobs.scheduler.js";
import { JobsService } from "./jobs.service.js";

/** Periyodik işler (pg-boss). Yeni periyodik iş eklenince JobsService.tick'e bir adım eklenir. */
@Module({
  imports: [LoadsModule, VehiclesModule],
  controllers: [AdminJobsController],
  providers: [JobsService, JobsScheduler],
})
export class JobsModule {}
