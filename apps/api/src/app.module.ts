import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthController } from "./health.controller.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { LoadsModule } from "./loads/loads.module.js";
import { LocationsController } from "./locations.controller.js";
import { ReportsModule } from "./reports/reports.module.js";
import { UsersModule } from "./users/users.module.js";
import { VehiclesModule } from "./vehicles/vehicles.module.js";

@Module({
  imports: [DbModule, AuthModule, UsersModule, LoadsModule, ReportsModule, VehiclesModule, JobsModule],
  controllers: [HealthController, LocationsController],
})
export class AppModule {}
