import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Put, UseGuards } from "@nestjs/common";
import { SETTING_KEYS, type SettingKey } from "@nakliye/shared";
import { SETTINGS } from "@nakliye/shared";
import { AuthGuard, CurrentUser, Roles } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { SettingsService } from "./settings.service.js";

const keyOf = (k: string): SettingKey => {
  if (!(SETTING_KEYS as string[]).includes(k)) throw new NotFoundException("Ayar bulunamadı");
  return k as SettingKey;
};

/** FR-54 parametre yönetimi (yönetici, ikinci adımlı oturum) */
@Controller("admin/settings")
@UseGuards(AuthGuard)
@Roles("admin")
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  view() {
    return this.settings.adminView();
  }

  /** Tam nesne; doğrulama ayarın kendi şemasıyla (hata biçimi diğer uçlarla aynı: alan yolu + Türkçe mesaj) */
  @Put(":key")
  update(@CurrentUser() user: AccessPayload, @Param("key") k: string, @Body() body: unknown) {
    const key = keyOf(k);
    const value = new ZodPipe(SETTINGS[key].schema as never).transform(body);
    return this.settings.update(user.sub, key, value as never);
  }

  @Post(":key/reset")
  @HttpCode(200)
  reset(@CurrentUser() user: AccessPayload, @Param("key") k: string) {
    return this.settings.reset(user.sub, keyOf(k));
  }
}
