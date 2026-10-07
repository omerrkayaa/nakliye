import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, Roles } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { MatchingService } from "./matching.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });

/**
 * Eşleşmeler ilan başına listelenir (docs/04'teki tek GET /matches yerine): arayüzde ilan detayında gösterilir.
 * Liste canlı hesaplanır; ilan düzenlense de günceldir.
 */
@Controller()
@UseGuards(AuthGuard)
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Get("loads/:id/matches")
  @Roles("shipper")
  forLoad(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.matching.forLoad(user.sub, id);
  }

  @Get("capacity/:id/matches")
  @Roles("carrier")
  forCapacity(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.matching.forCapacity(user.sub, id);
  }
}
