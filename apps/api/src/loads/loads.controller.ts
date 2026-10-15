import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  bulkLoadSchema,
  closeLoadSchema,
  confirmLoadSchema,
  createLoadSchema,
  loadSearchSchema,
  pageSchema,
  reviewLoadSchema,
  updateLoadSchema,
  type BulkLoadInput,
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

  /** P2 gösterge paneli özeti (":id"den önce) */
  @Get("mine/summary")
  @Roles("shipper")
  summary(@CurrentUser() user: AccessPayload) {
    return this.loads.summary(user.sub);
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

  /** FR-11 Excel toplu ilan (web paneli dosyayı okuyup satırları gönderir; dosya saklanmaz) */
  @Post("bulk")
  @Roles("shipper")
  bulk(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(bulkLoadSchema)) body: BulkLoadInput) {
    return this.loads.createBulk(user.sub, body.items);
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

  /** "Ara": numarayı açar ve loglar (BR-40). Nakliyeci içindir; yük sahibinin yük sahibini araması gerekmez. */
  @Post(":id/call")
  @HttpCode(200)
  @Roles("carrier")
  call(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.loads.call(user.sub, id);
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
  review(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string, @Body(new ZodPipe(reviewLoadSchema)) body: ReviewLoadInput) {
    return this.loads.review(user.sub, id, body.decision);
  }
}
