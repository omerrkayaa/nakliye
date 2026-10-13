import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ACCOUNT_DELETION } from "@nakliye/shared";
import { JwtService } from "@nestjs/jwt";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { deletedPhoneHmac, randomToken, sha256, sixDigitCode } from "../common/hash.js";
import { SmsService } from "../common/sms.service.js";
import { DB, type Db } from "../db/db.module.js";
import { otpCodes, refreshTokens, userRoles, users } from "../db/schema.js";

// docs/04 §8: OTP 6 hane, 3 dk geçerli, 5 deneme
const OTP_TTL_MS = 3 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_MS = 60_000;
const REFRESH_TTL_MS = 30 * 24 * 3_600_000;
// Destek kanalı (W4 iletişim) gelince mesaja eklenmeli
export const SUSPENDED_MESSAGE = "Hesabınız askıya alındı.";
/** Silme başladı ama anonimleştirme bitmedi (zamanlayıcı tamamlar); numara o ana kadar yeni hesaba açılamaz */
const DELETING_MESSAGE = "Hesap silme işlemi sürüyor. Birkaç dakika sonra tekrar deneyin.";
const OTP_SMS = {
  giris: (code: string) => `Nakliye giriş kodunuz: ${code}. Kimseyle paylaşmayın.`,
  // Türkçe karakterli SMS 70 karakterle sınırlı (UCS-2); bu metin 58 karakter
  silme: (code: string) => `Nakliye hesap silme kodunuz: ${code}. Kimseyle paylaşmayın.`,
};
/** Kodun amacı (otp_codes.purpose): giriş kodu silmede, silme kodu girişte geçmez */
export type OtpPurpose = keyof typeof OTP_SMS;

/**
 * Demo hesabı (mobil uygulamayı telefonda denemek için): DEMO_PHONE'a her zaman DEMO_OTP gider.
 * Yalnız SMS konsola yazılırken (geliştirme) geçerli; gerçek sağlayıcı bağlanınca kendiliğinden kapanır.
 */
function demoCode(phone: string): string | null {
  const { DEMO_PHONE, DEMO_OTP, SMS_PROVIDER = "console" } = process.env;
  if (SMS_PROVIDER !== "console" || !DEMO_PHONE || !/^\d{6}$/.test(DEMO_OTP ?? "")) return null;
  return phone === DEMO_PHONE ? DEMO_OTP! : null;
}

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

  private otpKey(phone: string, purpose: OtpPurpose) {
    return and(eq(otpCodes.phone, phone), eq(otpCodes.purpose, purpose));
  }

  async requestOtp(phone: string, purpose: OtpPurpose = "giris"): Promise<void> {
    const [existing] = await this.db.select().from(otpCodes).where(this.otpKey(phone, purpose));
    if (existing && existing.expiresAt.getTime() - OTP_TTL_MS + OTP_RESEND_MS > Date.now()) {
      throw new HttpException("Yeni kod için biraz bekleyin", HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = demoCode(phone) ?? sixDigitCode();
    const row = { phone, purpose, codeHash: this.otpHash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 };
    await this.db.insert(otpCodes).values(row).onConflictDoUpdate({ target: [otpCodes.phone, otpCodes.purpose], set: row });
    await this.sms.send(phone, OTP_SMS[purpose](code));
  }

  /** Kodu doğrular ve harcar (tek kullanımlık); her deneme hakkından düşer. Giriş ve hesap silme kullanır. */
  async consumeOtp(phone: string, code: string, purpose: OtpPurpose = "giris"): Promise<void> {
    const key = this.otpKey(phone, purpose);
    const expired = () => new UnauthorizedException("Kodun süresi doldu, yeni kod isteyin");
    // Deneme hakkı karşılaştırmadan önce atomik ayrılır: aynı anda gelen denemelerden (doğrusu dahil) en çok
    // OTP_MAX_ATTEMPTS tanesi karşılaştırılır. Önce okuyup sonra artırmak paralel tahminlerin hepsini değerlendirirdi.
    const [otp] = await this.db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(and(key, lt(otpCodes.attempts, OTP_MAX_ATTEMPTS), gt(otpCodes.expiresAt, new Date())))
      .returning({ codeHash: otpCodes.codeHash });
    if (!otp) throw expired();
    if (otp.codeHash !== this.otpHash(phone, code)) throw new UnauthorizedException("Kod hatalı");
    // Aynı doğru kodla gelen paralel isteklerden yalnız satırı silen geçer (kod tek kullanımlık)
    const used = await this.db.delete(otpCodes).where(and(key, eq(otpCodes.codeHash, otp.codeHash))).returning({ phone: otpCodes.phone });
    if (used.length === 0) throw expired();
  }

  async verifyOtp(phone: string, code: string) {
    await this.consumeOtp(phone, code);

    // BR-12: bir telefon numarası = tek hesap. Silinen hesabın numarası boşaltılır; süresi içinde dönülürse eski hesap
    // geri açılır, yoksa yeni hesap
    let [user] = await this.db.select().from(users).where(eq(users.phone, phone));
    if (!user) [user] = await this.restoreDeleted(phone);
    const isNew = !user;
    if (!user) [user] = await this.db.insert(users).values({ phone }).returning();
    if (user!.status === "askida") throw new ForbiddenException(SUSPENDED_MESSAGE);
    if (user!.status === "silindi") throw new ForbiddenException(DELETING_MESSAGE);

    return { isNew, ...(await this.issueTokens(user!.id)) };
  }

  /**
   * FR-07: ACCOUNT_DELETION.restoreDays içinde silinen hesap aynı numarayla geri açılır — aldığı puanlar, güven skoru,
   * iş geçmişi ve hakkındaki açık şikayetler geri gelir; ad, firma, rol ve araçlar silinmişti, yeniden girilir. Yalnız
   * anonimleştirmesi bitmiş (numarası boşalmış) hesap; bitmemişse giriş "silme sürüyor" der.
   */
  private restoreDeleted(phone: string, now = new Date()) {
    return this.db
      .update(users)
      .set({ phone, phoneHmac: null, status: "aktif", deletedAt: null, name: null })
      .where(
        and(
          eq(users.phoneHmac, deletedPhoneHmac(phone)),
          eq(users.status, "silindi"),
          isNull(users.phone),
          gt(users.deletedAt, new Date(now.getTime() - ACCOUNT_DELETION.restoreDays * 24 * 3_600_000)),
        ),
      )
      .returning();
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
    // Askıya alınan hesabın belirteçleri askıya alırken iptal edilir; bu ikinci kilit (yarışta açık kalanlar için)
    const [owner] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, row.userId));
    if (owner?.status === "askida") throw new UnauthorizedException(SUSPENDED_MESSAGE);
    if (!owner || owner.status === "silindi") throw new UnauthorizedException("Oturum süresi doldu");
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

  /**
   * Güncel rollerle erişim belirteci üretir. Roller belirtecin içinde taşındığı için rol değişince
   * (POST /me/roles) yeni belirteç verilir; yoksa kullanıcı belirteç süresi dolana kadar eski rollerle kalır.
   */
  async accessTokenFor(userId: string): Promise<string> {
    const roles = await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    const payload: AccessPayload = { sub: userId, roles: roles.map((r) => r.role) };
    return this.jwt.signAsync(payload);
  }

  private async issueTokens(userId: string) {
    const accessToken = await this.accessTokenFor(userId);
    const refreshToken = randomToken();
    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return { accessToken, refreshToken };
  }
}
