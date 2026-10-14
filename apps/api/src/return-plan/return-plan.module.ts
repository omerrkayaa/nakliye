import { Controller, Get, Module, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, Roles } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { LoadsModule } from "../loads/loads.module.js";
import { ReturnPlanService } from "./return-plan.service.js";

/** F4 dönüş planı (FR-24, UC-12): nakliyecinin süren işi için dönüş ve rota üstü yük önerileri. */
@Controller("return-plan")
@UseGuards(AuthGuard)
@Roles("carrier")
export class ReturnPlanController {
  constructor(private readonly plans: ReturnPlanService) {}

  @Get(":jobId")
  plan(@CurrentUser() user: AccessPayload, @Param("jobId", new ParseUUIDPipe({ version: "4" })) jobId: string) {
    return this.plans.plan(user.sub, jobId);
  }
}

/** LoadsModule eşleştirmeyi içe aktardığı için ayrı modül (döngüsel bağımlılık olmasın). */
@Module({
  imports: [LoadsModule],
  controllers: [ReturnPlanController],
  providers: [ReturnPlanService],
})
export class ReturnPlanModule {}
