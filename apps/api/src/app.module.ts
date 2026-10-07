import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthController } from "./health.controller.js";
import { LoadsModule } from "./loads/loads.module.js";
import { LocationsController } from "./locations.controller.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [DbModule, AuthModule, UsersModule, LoadsModule],
  controllers: [HealthController, LocationsController],
})
export class AppModule {}
