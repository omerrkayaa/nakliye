import { Module } from "@nestjs/common";
import { LoadsModule } from "../loads/loads.module.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";

@Module({
  imports: [LoadsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
