import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthController } from "./health.controller.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [DbModule, AuthModule, UsersModule],
  controllers: [HealthController],
})
export class AppModule {}
