import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { deleteAccountSchema, type DeleteAccountInput } from "@nakliye/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { AccountService } from "./account.service.js";

/** KVKK (FR-07, docs/04 §6): `GET /me/export`, `POST /me/deletion-code`, `DELETE /me`; FR-08 `POST /me/freeze`. Rol gerekmez. */
@Controller("me")
@UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get("export")
  export(@CurrentUser() user: AccessPayload) {
    return this.account.exportData(user.sub);
  }

  /** Silme onay kodu hesabın numarasına SMS'le gider; silmeyi engelleyen durum varsa (süren taşıma) kod gönderilmez (409). */
  @Post("deletion-code")
  @HttpCode(204)
  async deletionCode(@CurrentUser() user: AccessPayload) {
    await this.account.requestDeletionCode(user.sub);
  }

  /** FR-08: hesabı dondur; SMS koduyla giriş açar. Süren taşıma ya da yönetici rolü varsa 409. */
  @Post("freeze")
  @HttpCode(200)
  freeze(@CurrentUser() user: AccessPayload) {
    return this.account.freezeAccount(user.sub);
  }

  @Delete()
  delete(@CurrentUser() user: AccessPayload, @Body(new ZodPipe(deleteAccountSchema)) body: DeleteAccountInput) {
    return this.account.deleteAccount(user.sub, body.code);
  }
}
