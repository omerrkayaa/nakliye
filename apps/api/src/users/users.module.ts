import { Module } from "@nestjs/common";
import { RatingsModule } from "../ratings/ratings.module.js";
import { CompaniesController, MeController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [RatingsModule],
  controllers: [MeController, CompaniesController],
  providers: [UsersService],
})
export class UsersModule {}
