import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import {
  createRouteAlertSchema,
  updateRouteAlertSchema,
  type CreateRouteAlertInput,
  type UpdateRouteAlertInput,
} from "@nakliye/shared";
import { AuthGuard, CurrentUser, Roles } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { AlertsService } from "./alerts.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });

/** Rota alarmları (FR-22, A8). */
@Controller("alerts")
@UseGuards(AuthGuard)
@Roles("carrier")
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() user: AccessPayload) {
    return this.alerts.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(createRouteAlertSchema)) body: CreateRouteAlertInput) {
    return this.alerts.create(user.sub, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AccessPayload,
    @Param("id", uuid) id: string,
    @Body(new ZodPipe(updateRouteAlertSchema)) body: UpdateRouteAlertInput,
  ) {
    return this.alerts.update(user.sub, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    await this.alerts.remove(user.sub, id);
  }
}
