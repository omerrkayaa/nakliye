import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  closeCapacitySchema,
  createCapacitySchema,
  createVehicleSchema,
  pageSchema,
  updateCapacitySchema,
  updateVehicleSchema,
  type CloseCapacityInput,
  type CreateCapacityInput,
  type CreateVehicleInput,
  type UpdateCapacityInput,
  type UpdateVehicleInput,
} from "@nakliye/shared";
import { AuthGuard, CurrentUser, Roles } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { CapacityService } from "./capacity.service.js";
import { VehiclesService } from "./vehicles.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });

@Controller("vehicles")
@UseGuards(AuthGuard)
@Roles("carrier")
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  list(@CurrentUser() user: AccessPayload) {
    return this.vehicles.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(createVehicleSchema)) body: CreateVehicleInput) {
    return this.vehicles.create(user.sub, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AccessPayload,
    @Param("id", uuid) id: string,
    @Body(new ZodPipe(updateVehicleSchema)) body: UpdateVehicleInput,
  ) {
    return this.vehicles.update(user.sub, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    await this.vehicles.remove(user.sub, id);
  }
}

/** Boş araç ilanı (FR-12). GET /capacity: nakliyecinin kendi ilanları. */
@Controller("capacity")
@UseGuards(AuthGuard)
@Roles("carrier")
export class CapacityController {
  constructor(private readonly capacity: CapacityService) {}

  @Get()
  mine(@CurrentUser() user: AccessPayload, @Query(new ZodPipe(pageSchema)) q: { page: number }) {
    return this.capacity.mine(user.sub, q.page);
  }

  @Get(":id")
  get(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.capacity.get(user.sub, id);
  }

  @Post()
  create(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(createCapacitySchema)) body: CreateCapacityInput) {
    return this.capacity.create(user.sub, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AccessPayload,
    @Param("id", uuid) id: string,
    @Body(new ZodPipe(updateCapacitySchema)) body: UpdateCapacityInput,
  ) {
    return this.capacity.update(user.sub, id, body);
  }

  @Post(":id/close")
  @HttpCode(200)
  close(
    @CurrentUser() user: AccessPayload,
    @Param("id", uuid) id: string,
    @Body(new ZodPipe(closeCapacitySchema)) body: CloseCapacityInput,
  ) {
    return this.capacity.close(user.sub, id, body.reason);
  }
}
