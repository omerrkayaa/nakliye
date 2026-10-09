import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  cancelJobSchema,
  createOfferSchema,
  deliverJobSchema,
  disputeJobSchema,
  jobListSchema,
  jobStatusSchema,
  pageSchema,
  type CreateOfferInput,
  type DeliverJobInput,
  type JobListInput,
  type JobStatusInput,
  type ReasonInput,
} from "@nakliye/shared";
import { AuthGuard, CurrentUser, Roles } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { CarriersService } from "./carriers.service.js";
import { JobsService } from "./jobs.service.js";
import { OffersService } from "./offers.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });

/** P7 Nakliyecilerim: birlikte iş yapılan nakliyeciler ve favoriler */
@Controller("me/carriers")
@UseGuards(AuthGuard)
@Roles("shipper")
export class CarriersController {
  constructor(private readonly carriers: CarriersService) {}

  @Get()
  list(@CurrentUser() user: AccessPayload) {
    return this.carriers.list(user.sub);
  }

  @Put(":id/favorite")
  favorite(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.carriers.setFavorite(user.sub, id, true);
  }

  @Delete(":id/favorite")
  unfavorite(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.carriers.setFavorite(user.sub, id, false);
  }
}

/** Teklifler (FR-30, FR-31) */
@Controller()
@UseGuards(AuthGuard)
export class OffersController {
  constructor(
    private readonly offers: OffersService,
    private readonly jobs: JobsService,
  ) {}

  @Post("loads/:id/offers")
  @Roles("carrier")
  create(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string, @Body(new ZodPipe(createOfferSchema)) body: CreateOfferInput) {
    return this.offers.create(user.sub, id, body);
  }

  @Get("loads/:id/offers")
  @Roles("shipper")
  forLoad(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.offers.forLoad(user.sub, id);
  }

  @Get("offers")
  @Roles("carrier")
  mine(@CurrentUser() user: AccessPayload, @Query(new ZodPipe(pageSchema)) q: { page: number }) {
    return this.offers.mine(user.sub, q.page);
  }

  @Post("offers/:id/withdraw")
  @HttpCode(200)
  @Roles("carrier")
  withdraw(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.offers.withdraw(user.sub, id);
  }

  /** Kabul → iş oluşur; teslim kodu yalnız bu yanıtta döner (ve SMS'le gider). */
  @Post("offers/:id/accept")
  @Roles("shipper")
  accept(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.jobs.accept(user.sub, id);
  }
}

/** İşler (FR-32…34). Yetki serviste: yalnız işin tarafları, işleme göre doğru taraf. */
@Controller("jobs")
@UseGuards(AuthGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(@CurrentUser() user: AccessPayload, @Query(new ZodPipe(jobListSchema)) q: JobListInput) {
    return this.jobs.list(user.sub, q);
  }

  @Get(":id")
  get(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.jobs.get(user.sub, id);
  }

  @Post(":id/status")
  @HttpCode(200)
  status(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string, @Body(new ZodPipe(jobStatusSchema)) body: JobStatusInput) {
    return this.jobs.setStatus(user.sub, id, body.status);
  }

  @Post(":id/deliver")
  @HttpCode(200)
  deliver(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string, @Body(new ZodPipe(deliverJobSchema)) body: DeliverJobInput) {
    return this.jobs.deliver(user.sub, id, body.code);
  }

  @Post(":id/delivery-code")
  @HttpCode(200)
  newCode(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.jobs.newDeliveryCode(user.sub, id);
  }

  @Post(":id/complete")
  @HttpCode(200)
  complete(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.jobs.complete(user.sub, id);
  }

  @Post(":id/dispute")
  @HttpCode(200)
  dispute(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string, @Body(new ZodPipe(disputeJobSchema)) body: ReasonInput) {
    return this.jobs.dispute(user.sub, id, body.reason);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string, @Body(new ZodPipe(cancelJobSchema)) body: ReasonInput) {
    return this.jobs.cancel(user.sub, id, body.reason);
  }
}
