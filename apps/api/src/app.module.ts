import { Module } from "@nestjs/common";
import { AccountModule } from "./account/account.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { AuditModule } from "./audit/audit.service.js";
import { AuthModule } from "./auth/auth.module.js";
import { DbModule } from "./db/db.module.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { FilesModule } from "./files/files.module.js";
import { HealthController } from "./health.controller.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { LoadsModule } from "./loads/loads.module.js";
import { LocationsController } from "./locations.controller.js";
import { PriceController } from "./price.controller.js";
import { PublicRoutesController } from "./public-routes.controller.js";
import { ReturnPlanModule } from "./return-plan/return-plan.module.js";
import { RoutesModule } from "./routes.service.js";
import { MatchingModule } from "./matching/matching.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { SchedulerModule } from "./scheduler/scheduler.module.js";
import { AdminSettingsController } from "./settings/settings.controller.js";
import { SettingsModule } from "./settings/settings.service.js";
import { UsersModule } from "./users/users.module.js";
import { VehiclesModule } from "./vehicles/vehicles.module.js";

@Module({
  imports: [
    DbModule,
    AuditModule,
    SettingsModule,
    RoutesModule,
    FilesModule,
    AuthModule,
    NotificationsModule,
    UsersModule,
    AccountModule,
    MatchingModule,
    LoadsModule,
    ReportsModule,
    VehiclesModule,
    DocumentsModule,
    JobsModule,
    ReturnPlanModule,
    SchedulerModule,
    AdminModule,
  ],
  controllers: [HealthController, LocationsController, PriceController, PublicRoutesController, AdminSettingsController],
})
export class AppModule {}
