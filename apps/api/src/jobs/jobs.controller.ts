import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, Roles } from "../auth/auth.guard.js";
import { JobsService } from "./jobs.service.js";

/** Periyodik turu elle çalıştırır (test ve demo; normalde zamanlayıcı her 5 dk çalıştırır). */
@Controller("admin/jobs")
@UseGuards(AuthGuard)
@Roles("admin")
export class AdminJobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post("tick")
  @HttpCode(200)
  tick() {
    return this.jobs.tick();
  }
}
