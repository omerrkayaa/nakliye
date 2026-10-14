import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { totpCodeSchema, totpSetupSchema, type TotpCodeInput, type TotpSetupInput } from "@nakliye/shared";
import { ZodPipe } from "../common/zod.pipe.js";
import { AuthGuard, CurrentUser } from "./auth.guard.js";
import type { AccessPayload } from "./auth.service.js";
import { MfaService } from "./mfa.service.js";

/**
 * Yönetici iki adımlı doğrulama kurulumu (NFR-04). @Roles("admin") yok: kurulumsuz yöneticinin belirtecinde rol
 * bulunmaz; servis rolü DB'den denetler.
 */
@Controller("me/totp")
@UseGuards(AuthGuard)
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get()
  status(@CurrentUser() user: AccessPayload) {
    return this.mfa.status(user.sub);
  }

  @Post("setup")
  setup(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(totpSetupSchema)) body: TotpSetupInput) {
    return this.mfa.setup(user.sub, body.code);
  }

  @Post("enable")
  enable(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(totpCodeSchema)) body: TotpCodeInput) {
    return this.mfa.enable(user.sub, body.code);
  }

  @Post("recovery-codes")
  recoveryCodes(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(totpCodeSchema)) body: TotpCodeInput) {
    return this.mfa.regenerateRecoveryCodes(user.sub, body.code);
  }
}
