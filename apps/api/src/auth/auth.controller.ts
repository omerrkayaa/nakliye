import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { otpRequestSchema, otpVerifySchema } from "@nakliye/shared";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { AuthService } from "./auth.service.js";

const refreshSchema = z.object({ refreshToken: z.string().min(20) });

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp/request")
  @HttpCode(204)
  async requestOtp(@Body(new ZodPipe(otpRequestSchema)) body: z.infer<typeof otpRequestSchema>) {
    await this.auth.requestOtp(body.phone);
  }

  @Post("otp/verify")
  verifyOtp(@Body(new ZodPipe(otpVerifySchema)) body: z.infer<typeof otpVerifySchema>) {
    return this.auth.verifyOtp(body.phone, body.code);
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
