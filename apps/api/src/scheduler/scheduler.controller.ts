import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, Roles } from "../auth/auth.guard.js";
import { SchedulerService } from "./scheduler.service.js";

/** Periyodik turu elle çalıştırır (test ve demo; normalde zamanlayıcı her 5 dk çalıştırır). */
@Controller("admin")
@UseGuards(AuthGuard)
@Roles("admin")
export class AdminSchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @Post("tick")
  @HttpCode(200)
  tick() {
    return this.scheduler.tick();
  }
}
