import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { createRatingSchema, type CreateRatingInput } from "@nakliye/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { RatingsService } from "./ratings.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });

/** Puanlama (FR-40) ve itibar profili (FR-41). Yetki serviste: yalnız işin tarafları puanlar. */
@Controller()
@UseGuards(AuthGuard)
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post("jobs/:id/rating")
  rate(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string, @Body(new ZodPipe(createRatingSchema)) body: CreateRatingInput) {
    return this.ratings.rate(user.sub, id, body);
  }

  @Get("users/:id/reputation")
  reputation(@Param("id", uuid) id: string) {
    return this.ratings.reputation(id);
  }
}
