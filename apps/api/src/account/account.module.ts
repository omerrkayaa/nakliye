import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { LoadsModule } from "../loads/loads.module.js";
import { VehiclesModule } from "../vehicles/vehicles.module.js";
import { AccountController } from "./account.controller.js";
import { AccountService } from "./account.service.js";

/** Hesap silme ve veri dökümü (FR-07). Askıya alma (AdminModule) ve zamanlayıcı da AccountService'i kullanır. */
@Module({
  imports: [LoadsModule, VehiclesModule, JobsModule, DocumentsModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
