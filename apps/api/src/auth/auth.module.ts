import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { SmsService } from "../common/sms.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error("JWT_SECRET tanımlı değil (.env.example'a bakın)");
        return { secret, signOptions: { expiresIn: "15m" } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, SmsService],
  exports: [AuthGuard, JwtModule, SmsService],
})
export class AuthModule {}
