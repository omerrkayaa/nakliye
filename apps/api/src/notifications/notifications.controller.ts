import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { pageSchema } from "@nakliye/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { NotificationsService } from "./notifications.service.js";

/** A14 Bildirimler ekranı */
@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AccessPayload, @Query(new ZodPipe(pageSchema)) q: { page: number }) {
    return this.notifications.list(user.sub, q.page);
  }

  @Post("read-all")
  @HttpCode(204)
  async readAll(@CurrentUser() user: AccessPayload) {
    await this.notifications.markAllRead(user.sub);
  }

  @Post(":id/read")
  @HttpCode(204)
  async read(@CurrentUser() user: AccessPayload, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    await this.notifications.markRead(user.sub, id);
  }
}
