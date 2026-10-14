import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import {
  addRolesSchema,
  createCompanySchema,
  updateCompanySchema,
  updateMeSchema,
  type AddRolesInput,
  type CreateCompanyInput,
  type UpdateCompanyInput,
  type UpdateMeInput,
} from "@nakliye/shared";
import { AuthGuard, CurrentUser, Roles } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { UsersService } from "./users.service.js";

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser() user: AccessPayload) {
    const me = await this.users.getMe(user.sub);
    return { ...me, adminMfa: await this.users.adminMfa(user.sub, me.roles, user.roles) };
  }

  @Patch()
  update(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(updateMeSchema)) body: UpdateMeInput) {
    return this.users.updateMe(user.sub, body);
  }

  @Post("roles")
  addRoles(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(addRolesSchema)) body: AddRolesInput) {
    return this.users.addRoles(user.sub, body, user.mfa ? new Date(user.mfa) : null);
  }
}

/** Firma bilgisi (FR-03). Önce rol seçilmiş olmalı: uygulama akışı "rol seç → firma bilgisi". */
@Controller("companies")
@UseGuards(AuthGuard)
@Roles("carrier", "shipper")
export class CompaniesController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(createCompanySchema)) body: CreateCompanyInput) {
    return this.users.createCompany(user.sub, body);
  }

  @Patch()
  update(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(updateCompanySchema)) body: UpdateCompanyInput) {
    return this.users.updateCompany(user.sub, body);
  }
}
