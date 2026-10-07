import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { and, eq, gt, isNull } from "drizzle-orm";
import { randomToken, sha256, sixDigitCode } from "../common/hash.js";
import { SmsService } from "../common/sms.service.js";
import { DB, type Db } from "../db/db.module.js";
import { otpCodes, refreshTokens, userRoles, users } from "../db/schema.js";

// docs/04 §8: OTP 6 hane, 3 dk geçerli, 5 deneme
const OTP_TTL_MS = 3 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_MS = 60_000;
const REFRESH_TTL_MS = 30 * 24 * 3_600_000;

export interface AccessPayload {
  sub: string;
  roles: string[];
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
    private readonly sms: SmsService,
  ) {}

  private otpHash(phone: string, code: string) {
    return sha256(`${phone}:${code}:${process.env.OTP_PEPPER ?? ""}`);
  }

  async requestOtp(phone: string): Promise<void> {
    const [existing] = await this.db.select().from(otpCodes).where(eq(otpCodes.phone, phone));
    if (existing && existing.expiresAt.getTime() - OTP_TTL_MS + OTP_RESEND_MS > Date.now()) {
      throw new HttpException("Yeni kod için biraz bekleyin", HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = sixDigitCode();
    const row = { phone, codeHash: this.otpHash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 };
    await this.db.insert(otpCodes).values(row).onConflictDoUpdate({ target: otpCodes.phone, set: row });
    await this.sms.send(phone, `Nakliye giriş kodunuz: ${code}. Kimseyle paylaşmayın.`);
  }

  async verifyOtp(phone: string, code: string) {
    const [otp] = await this.db.select().from(otpCodes).where(eq(otpCodes.phone, phone));
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException("Kodun süresi doldu, yeni kod isteyin");
    }
    if (otp.codeHash !== this.otpHash(phone, code)) {
      await this.db.update(otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(otpCodes.phone, phone));
      throw new UnauthorizedException("Kod hatalı");
    }
    await this.db.delete(otpCodes).where(eq(otpCodes.phone, phone));

    // BR-12: bir telefon numarası = tek hesap
    let [user] = await this.db.select().from(users).where(eq(users.phone, phone));
    const isNew = !user;
    if (!user) [user] = await this.db.insert(users).values({ phone }).returning();

    return { isNew, ...(await this.issueTokens(user!.id)) };
  }

  async refresh(refreshToken: string) {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, sha256(refreshToken)),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      );
    if (!row) throw new UnauthorizedException("Oturum süresi doldu");
    // Yenileme belirteci tek kullanımlıktır (rotation).
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    return this.issueTokens(row.userId);
  }

  async logout(refreshToken: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, sha256(refreshToken)));
  }

  private async issueTokens(userId: string) {
    const roles = await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    const payload: AccessPayload = { sub: userId, roles: roles.map((r) => r.role) };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomToken();
    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return { accessToken, refreshToken };
  }
}
