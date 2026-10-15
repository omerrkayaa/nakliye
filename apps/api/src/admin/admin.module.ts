import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { LoadsModule } from "../loads/loads.module.js";
import { RatingsModule } from "../ratings/ratings.module.js";
import { VehiclesModule } from "../vehicles/vehicles.module.js";
import { AdminAuditController, AdminDisputesController, AdminMetricsController, AdminReportsController, AdminUsersController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { MetricsService } from "./metrics.service.js";

/** Yönetici işleri (Y2, Y3, itirazlar). İlan moderasyonu (Y4) LoadsModule'de, periyodik tur SchedulerModule'de. */
@Module({
  imports: [LoadsModule, VehiclesModule, JobsModule, RatingsModule, AccountModule],
  controllers: [AdminReportsController, AdminUsersController, AdminDisputesController, AdminMetricsController, AdminAuditController],
  providers: [AdminService, MetricsService],
})
export class AdminModule {}
