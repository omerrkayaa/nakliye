import { Module } from "@nestjs/common";
import { CapacityService } from "./capacity.service.js";
import { CapacityController, VehiclesController } from "./vehicles.controller.js";
import { VehiclesService } from "./vehicles.service.js";

@Module({
  controllers: [VehiclesController, CapacityController],
  providers: [VehiclesService, CapacityService],
  exports: [CapacityService],
})
export class VehiclesModule {}
