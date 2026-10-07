import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthController } from "./health.controller.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { LoadsModule } from "./loads/loads.module.js";
import { LocationsController } from "./locations.controller.js";
import { MatchingModule } from "./matching/matching.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { SchedulerModule } from "./scheduler/scheduler.module.js";
import { UsersModule } from "./users/users.module.js";
import { VehiclesModule } from "./vehicles/vehicles.module.js";

@Module({
  imports: [
    DbModule,
    AuthModule,
    NotificationsModule,
    UsersModule,
    MatchingModule,
    LoadsModule,
    ReportsModule,
    VehiclesModule,
    JobsModule,
    SchedulerModule,
  ],
  controllers: [HealthController, LocationsController],
})
export class AppModule {}
