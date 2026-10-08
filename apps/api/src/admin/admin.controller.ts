import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  adminReportListSchema,
  resolveReportSchema,
  suspendUserSchema,
  type AdminReportListInput,
  type ResolveReportInput,
  type SuspendUserInput,
} from "@nakliye/shared";
import { z } from "zod";
import { AuthGuard, CurrentUser, Roles } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { AdminService } from "./admin.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });
const userSearchSchema = z.object({ q: z.string().max(80).optional(), page: z.coerce.number().int().min(1).default(1) });

/** Y3 şikayet kuyruğu (FR-51) */
@Controller("admin/reports")
@UseGuards(AuthGuard)
@Roles("admin")
export class AdminReportsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list(@Query(new ZodPipe(adminReportListSchema)) q: AdminReportListInput) {
    return this.admin.listReports(q);
  }

  @Post(":id/resolve")
  @HttpCode(200)
  resolve(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string, @Body(new ZodPipe(resolveReportSchema)) body: ResolveReportInput) {
    return this.admin.resolveReport(user.sub, id, body);
  }
}

/** Y2 kullanıcılar: arama, askıya alma (FR-51) */
@Controller("admin/users")
@UseGuards(AuthGuard)
@Roles("admin")
export class AdminUsersController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list(@Query(new ZodPipe(userSearchSchema)) q: { q?: string; page: number }) {
    return this.admin.listUsers(q.q, q.page);
  }

  @Post(":id/suspend")
  @HttpCode(200)
  suspend(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string, @Body(new ZodPipe(suspendUserSchema)) body: SuspendUserInput) {
    return this.admin.suspend(user.sub, id, body.reason);
  }

  @Post(":id/unsuspend")
  @HttpCode(200)
  unsuspend(@Param("id", uuid) id: string) {
    return this.admin.unsuspend(id);
  }
}
