import { Body, Controller, HttpCode, Ip, Post } from "@nestjs/common";
import { otpRequestSchema, otpVerifySchema, totpLoginSchema, type TotpLoginInput } from "@nakliye/shared";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { AuthService } from "./auth.service.js";
import { MfaService } from "./mfa.service.js";

const refreshSchema = z.object({ refreshToken: z.string().min(20) });

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
  ) {}

  @Post("otp/request")
  @HttpCode(204)
  async requestOtp(@Body(new ZodPipe(otpRequestSchema)) body: z.infer<typeof otpRequestSchema>, @Ip() ip: string) {
    // ip: Express trust proxy ile çözülür (main.ts); web BFF istemcinin adresini X-Forwarded-For ile iletir
    await this.auth.requestOtp(body.phone, "giris", ip);
  }

  @Post("otp/verify")
  verifyOtp(@Body(new ZodPipe(otpVerifySchema)) body: z.infer<typeof otpVerifySchema>) {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  /** NFR-04: ikinci adımı kurulu hesapta (yönetici) otp/verify belirteç yerine challenge döner; kod burada */
  @Post("totp")
  totp(@Body(new ZodPipe(totpLoginSchema)) body: TotpLoginInput) {
    return this.mfa.login(body.challenge, body.code);
  }

  @Post("refresh")
  refresh(@Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>) {
    await this.auth.logout(body.refreshToken);
  }
}
