import { Module } from "@nestjs/common";
import { AdminLoadsController, LoadsController } from "./loads.controller.js";
import { LoadsService } from "./loads.service.js";

@Module({
  controllers: [LoadsController, AdminLoadsController],
  providers: [LoadsService],
})
export class LoadsModule {}
