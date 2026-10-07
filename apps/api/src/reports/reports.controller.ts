import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { createReportSchema, type CreateReportInput } from "@nakliye/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ReportsService } from "./reports.service.js";

/** Şikayet (UC-13): giriş yapmış herkes. Yönetici kuyruğu (FR-51) Faz 3'te. */
@Controller("reports")
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(createReportSchema)) body: CreateReportInput) {
    return this.reports.create(user.sub, body);
  }
}
