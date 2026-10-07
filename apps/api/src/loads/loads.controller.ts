import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  closeLoadSchema,
  confirmLoadSchema,
  createLoadSchema,
  loadSearchSchema,
  pageSchema,
  reviewLoadSchema,
  updateLoadSchema,
  type CloseLoadInput,
  type ConfirmLoadInput,
  type CreateLoadInput,
  type LoadSearchInput,
  type ReviewLoadInput,
  type UpdateLoadInput,
} from "@nakliye/shared";
import { AuthGuard, CurrentUser, Roles } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ConfirmationService } from "./confirmation.service.js";
import { LoadsService } from "./loads.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });

@Controller("loads")
@UseGuards(AuthGuard)
export class LoadsController {
  constructor(private readonly loads: LoadsService) {}

  @Get()
  search(@Query(new ZodPipe(loadSearchSchema)) q: LoadSearchInput) {
    return this.loads.search(q);
  }

  // ":id"den önce tanımlı olmalı
  @Get("mine")
  @Roles("shipper")
  mine(@CurrentUser() user: AccessPayload, @Query(new ZodPipe(pageSchema)) q: { page: number }) {
    return this.loads.mine(user.sub, q.page);
  }

  @Get(":id")
  get(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.loads.get(user.sub, id);
  }

  @Post()
  @Roles("shipper")
  create(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(createLoadSchema)) body: CreateLoadInput) {
    return this.loads.create(user.sub, body);
  }

  @Patch(":id")
  @Roles("shipper")
  update(
    @CurrentUser() user: AccessPayload,
    @Param("id", uuid) id: string,
    @Body(new ZodPipe(updateLoadSchema)) body: UpdateLoadInput,
  ) {
    return this.loads.update(user.sub, id, body);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @Roles("shipper")
  confirm(
    @CurrentUser() user: AccessPayload,
    @Param("id", uuid) id: string,
    @Body(new ZodPipe(confirmLoadSchema)) body: ConfirmLoadInput,
  ) {
    return this.loads.confirm(user.sub, id, body.answer);
  }

  @Post(":id/close")
  @HttpCode(200)
  @Roles("shipper")
  close(
    @CurrentUser() user: AccessPayload,
    @Param("id", uuid) id: string,
    @Body(new ZodPipe(closeLoadSchema)) body: CloseLoadInput,
  ) {
    return this.loads.close(user.sub, id, body.reason);
  }
}

/** BR-11 moderasyon kuyruğu (yönetici). Faz 3'te yönetici paneline bağlanacak. */
@Controller("admin/loads")
@UseGuards(AuthGuard)
@Roles("admin")
export class AdminLoadsController {
  constructor(private readonly loads: LoadsService) {}

  @Get()
  queue(@Query(new ZodPipe(pageSchema)) q: { page: number }) {
    return this.loads.moderationQueue(q.page);
  }

  @Post(":id/review")
  @HttpCode(200)
  review(@Param("id", uuid) id: string, @Body(new ZodPipe(reviewLoadSchema)) body: ReviewLoadInput) {
    return this.loads.review(id, body.decision);
  }
}

/** Teyit turunu elle çalıştırır (test ve demo; normalde zamanlayıcı her 5 dk çalıştırır). */
@Controller("admin/jobs")
@UseGuards(AuthGuard)
@Roles("admin")
export class AdminJobsController {
  constructor(private readonly confirmation: ConfirmationService) {}

  @Post("confirmation-tick")
  @HttpCode(200)
  tick() {
    return this.confirmation.tick();
  }
}
