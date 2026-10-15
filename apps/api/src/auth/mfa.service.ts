import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { maskPhone } from "@nakliye/shared";
import { and, count, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { trDuration } from "../common/format.js";
import { sha256 } from "../common/hash.js";
import { DB, type Db, type Tx } from "../db/db.module.js";
import { mfaChallenges, refreshTokens, totpRecoveryCodes, userRoles, users, userTotp } from "../db/schema.js";
import { AuthService, loginDenied } from "./auth.service.js";
import {
  base32Encode,
  matchTotp,
  newRecoveryCode,
  newTotpSecret,
  normalizeRecoveryCode,
  openSecret,
  otpauthUrl,
  RECOVERY_CODE_COUNT,
  recoveryCodeHash,
  sealSecret,
} from "./totp.js";

/** Ardışık 5 hatalı ikinci adım kodu → 15 dk kilit (giriş, cihaz değiştirme, kurtarma kodu yenileme ortak sayar) */
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;
/**
 * Kurulumda bekleyen anahtar 10 dk geçerli ve en çok 5 hatalı kod; sonra atılır, kurulum yeniden başlatılır. Etkinleştirme
 * kilit sayacına sayılmaz (kişi kendi anahtarını kuruyor) ama sınırsız da değil: yarım bırakılmış bir kurulum, oturumu
 * ele geçiren biri için sınırsız tahmin olmasın (güvenlik incelemesi 2026-10-15, bulgu 2).
 */
const PENDING_TTL_MS = 10 * 60_000;
const PENDING_MAX_ATTEMPTS = 5;

type Factor = "ok" | "wrong" | "reused" | { lockedUntil: Date };
type Failure = Exclude<Factor, "ok"> | "expired" | "code-required" | "no-pending" | "pending-expired" | "pending-exhausted";

/**
 * Yönetici iki adımlı doğrulaması (NFR-04, docs/04 §8; karar 2026-10-14: Google/Microsoft Authenticator gibi
 * uygulamalarla TOTP). Kurulumu tamamlamış hesap SMS koduyla tek başına oturum alamaz: giriş ikinci adımı ister
 * (AuthService.verifyOtp → challenge → POST /auth/totp). Yönetici rolü yalnız ikinci adımı 12 saat içinde geçmiş
 * oturumun belirtecinde bulunur (AuthService.accessTokenFor); kurulumsuz yöneticinin belirtecinde rol yoktur, bu yüzden
 * tüm yönetici uç noktaları ve "yönetici her belgeyi görür" gibi denetimler kendiliğinden ikinci adım ister.
 */
@Injectable()
export class MfaService {
  private readonly log = new Logger(MfaService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly auth: AuthService,
  ) {}

  /** Girişin ikinci adımı: SMS koduyla alınan challenge + uygulamadaki kod (ya da kurtarma kodu) → belirteçler */
  async login(challenge: string, code: string, now = new Date()) {
    const hash = sha256(challenge);
    const res = await this.db.transaction(async (tx): Promise<{ fail: Failure } | { tokens: { accessToken: string; refreshToken: string } }> => {
      // Kilit sırası: challenge → user_totp → users (issueTokens); hiçbir yol bunun tersini tutmaz
      const [c] = await tx.select().from(mfaChallenges).where(and(eq(mfaChallenges.tokenHash, hash), gt(mfaChallenges.expiresAt, now))).for("update");
      if (!c) return { fail: "expired" };
      const f = await this.secondFactor(tx, c.userId, code, now);
      if (f !== "ok") return { fail: f };
      await tx.delete(mfaChallenges).where(eq(mfaChallenges.tokenHash, hash));
      return { tokens: await this.auth.issueTokens(tx, c.userId, loginDenied, now) };
    });
    // Hata işlem bittikten sonra atılır: hatalı deneme sayısı geri alınmadan yazılsın
    if ("fail" in res) throw this.failure(res.fail, now);
    return res.tokens;
  }

  async status(userId: string, now = new Date()) {
    await this.requireAdmin(userId);
    const [t] = await this.db.select().from(userTotp).where(eq(userTotp.userId, userId));
    const [rc] = await this.db.select({ n: count() }).from(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
    return {
      enabled: !!t?.enabledAt,
      enabledAt: t?.enabledAt ?? null,
      pending: !!t?.pendingEnc,
      recoveryCodesLeft: rc?.n ?? 0,
      lockedUntil: t?.lockedUntil && t.lockedUntil > now ? t.lockedUntil : null,
    };
  }

  /**
   * Kurulumu başlatır: yeni anahtar "bekleyen" olarak saklanır, uygulamaya eklenecek adres (QR) ve elle girilecek anahtar
   * döner. Kurulu hesapta (cihaz değiştirme) mevcut uygulamadan ya da kurtarma kodundan bir kod istenir: ele geçirilmiş
   * bir oturum ikinci adımı kendi cihazına taşıyamasın. Eski anahtar yenisi onaylanana kadar geçerli kalır.
   */
  async setup(userId: string, code: string | undefined, now = new Date()) {
    const phone = await this.requireAdmin(userId);
    const secret = newTotpSecret();
    const fail = await this.db.transaction(async (tx): Promise<Failure | null> => {
      const [t] = await tx.select().from(userTotp).where(eq(userTotp.userId, userId)).for("update");
      if (t?.enabledAt) {
        if (!code) return "code-required";
        const f = await this.secondFactor(tx, userId, code, now);
        if (f !== "ok") return f;
      }
      const pending = { pendingEnc: sealSecret(secret, userId), pendingAt: now, pendingAttempts: 0 };
      await tx.insert(userTotp).values({ userId, ...pending }).onConflictDoUpdate({ target: userTotp.userId, set: pending });
      return null;
    });
    if (fail) throw this.failure(fail, now, true);
    return { secret: base32Encode(secret), otpauthUrl: otpauthUrl(secret, maskPhone(phone)) };
  }

  /**
   * Bekleyen anahtarı uygulamadan okunan kodla onaylar: anahtar etkinleşir, 10 yeni kurtarma kodu (yalnız bu yanıtta
   * görünür; DB'de anahtarlı özet), diğer tüm oturumlar kapanır (ikinci adımsız ya da eski cihazla açılmışlardı) ve bu
   * oturuma ikinci adımlı yeni belirteçler verilir. Hatalı kod kilide sayılmaz: bekleyen anahtarı kişi kendisi kuruyor.
   */
  async enable(userId: string, code: string, now = new Date()) {
    await this.requireAdmin(userId);
    const res = await this.db.transaction(async (tx): Promise<{ fail: Failure } | { tokens: { accessToken: string; refreshToken: string }; recoveryCodes: string[] }> => {
      // Kilit sırası user_totp → users → refresh_tokens (askıya alma: users → refresh_tokens; döngü yok)
      const [t] = await tx.select().from(userTotp).where(eq(userTotp.userId, userId)).for("update");
      if (!t?.pendingEnc) return { fail: "no-pending" };
      const discard = { pendingEnc: null, pendingAt: null, pendingAttempts: 0 };
      if (!t.pendingAt || now.getTime() - t.pendingAt.getTime() > PENDING_TTL_MS) {
        await tx.update(userTotp).set(discard).where(eq(userTotp.userId, userId));
        return { fail: "pending-expired" };
      }
      const step = matchTotp(openSecret(t.pendingEnc, userId), code.replace(/\s/g, ""), -1, now.getTime());
      if (step === null) {
        const attempts = t.pendingAttempts + 1;
        await tx.update(userTotp).set(attempts >= PENDING_MAX_ATTEMPTS ? discard : { pendingAttempts: attempts }).where(eq(userTotp.userId, userId));
        return { fail: attempts >= PENDING_MAX_ATTEMPTS ? "pending-exhausted" : "wrong" };
      }
      await tx
        .update(userTotp)
        .set({ secretEnc: t.pendingEnc, pendingEnc: null, pendingAt: null, pendingAttempts: 0, enabledAt: t.enabledAt ?? now, lastStep: step, failedCount: 0, lockedUntil: null })
        .where(eq(userTotp.userId, userId));
      const recoveryCodes = await this.replaceRecoveryCodes(tx, userId);
      const tokens = await this.auth.issueTokens(tx, userId, loginDenied, now);
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt), ne(refreshTokens.tokenHash, sha256(tokens.refreshToken))));
      return { tokens, recoveryCodes };
    });
    if ("fail" in res) throw this.failure(res.fail, now, true);
    return { recoveryCodes: res.recoveryCodes, ...res.tokens };
  }

  /** Yeni kurtarma kodları (eskiler geçersizleşir); uygulamadan bir kod ya da kalan kurtarma kodlarından biri ister */
  async regenerateRecoveryCodes(userId: string, code: string, now = new Date()) {
    await this.requireAdmin(userId);
    const res = await this.db.transaction(async (tx): Promise<{ fail: Failure } | { recoveryCodes: string[] }> => {
      const [t] = await tx.select({ enabledAt: userTotp.enabledAt }).from(userTotp).where(eq(userTotp.userId, userId));
      if (!t?.enabledAt) return { fail: "no-pending" };
      const f = await this.secondFactor(tx, userId, code, now);
      if (f !== "ok") return { fail: f };
      return { recoveryCodes: await this.replaceRecoveryCodes(tx, userId) };
    });
    if ("fail" in res) throw this.failure(res.fail, now, true);
    return res;
  }

  /** Zamanlayıcı: süresi dolan giriş challenge'ları */
  async purgeChallenges(now = new Date()): Promise<number> {
    const r = await this.db.delete(mfaChallenges).where(lt(mfaChallenges.expiresAt, now)).returning({ h: mfaChallenges.tokenHash });
    return r.length;
  }

  /**
   * İkinci adım kodu: uygulamadaki 6 hane (±30 sn, kullanılmış adım yeniden geçmez) ya da tek kullanımlık kurtarma kodu.
   * Satır kilitli (FOR UPDATE): aynı anda gelen denemeler sırayla değerlendirilir, sayaç ve tekrar koruması yarışmaz.
   */
  private async secondFactor(tx: Tx, userId: string, input: string, now: Date): Promise<Factor> {
    const [t] = await tx.select().from(userTotp).where(eq(userTotp.userId, userId)).for("update");
    if (!t?.secretEnc) return "wrong";
    if (t.lockedUntil && t.lockedUntil > now) return { lockedUntil: t.lockedUntil };
    const code = input.replace(/\s/g, "");
    let key: Buffer | null = null;
    try {
      key = openSecret(t.secretEnc, userId);
    } catch {
      // TOTP_KEY (ya da OTP_PEPPER) değişti ya da satır bozuk: uygulama kodu doğrulanamaz; kurtarma kodu yine geçer
      // (yönetici onunla girip cihazı yeniden kurar)
      this.log.error(`TOTP anahtarı çözülemedi (kullanıcı ${userId}); TOTP_KEY değişti mi?`);
    }
    const step = key ? matchTotp(key, code, t.lastStep, now.getTime()) : null;
    if (key && step !== null) {
      await tx.update(userTotp).set({ lastStep: step, failedCount: 0, lockedUntil: null }).where(eq(userTotp.userId, userId));
      return "ok";
    }
    // Pencerede geçerli ama kullanılmış kod: kişi aynı kodu ikinci kez girdi (saldırgan kodu bilmiyor; kilide sayılmaz)
    if (key && matchTotp(key, code, -1, now.getTime()) !== null) return "reused";
    const rc = normalizeRecoveryCode(code);
    if (rc) {
      const used = await tx
        .delete(totpRecoveryCodes)
        .where(and(eq(totpRecoveryCodes.userId, userId), eq(totpRecoveryCodes.codeHash, recoveryCodeHash(userId, rc))))
        .returning({ h: totpRecoveryCodes.codeHash });
      if (used.length) {
        await tx.update(userTotp).set({ failedCount: 0, lockedUntil: null }).where(eq(userTotp.userId, userId));
        return "ok";
      }
    }
    const failed = t.failedCount + 1;
    const lockedUntil = failed >= LOCK_AFTER ? new Date(now.getTime() + LOCK_MS) : null;
    await tx.update(userTotp).set({ failedCount: lockedUntil ? 0 : failed, lockedUntil }).where(eq(userTotp.userId, userId));
    return lockedUntil ? { lockedUntil } : "wrong";
  }

  private async replaceRecoveryCodes(tx: Tx, userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    await tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
    await tx.insert(totpRecoveryCodes).values(codes.map((c) => ({ userId, codeHash: recoveryCodeHash(userId, normalizeRecoveryCode(c)!) })));
    return codes;
  }

  /** Kurulum yalnız yöneticiler için; rol belirteçten değil DB'den (kurulumsuz yöneticinin belirtecinde rol yoktur) */
  private async requireAdmin(userId: string): Promise<string> {
    const [u] = await this.db
      .select({ phone: users.phone })
      .from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, "admin")))
      .where(eq(users.id, userId));
    if (!u?.phone) throw new ForbiddenException("İki adımlı doğrulama yalnız yönetici hesapları içindir");
    return u.phone;
  }

  /**
   * @param inSession oturumlu uç (kurulum, kurtarma kodu): yanlış kod 400 — 401 istemcide "oturum geçersiz" demek
   *   (web/mobil girişe yönlendirir); girişin ikinci adımında (oturum yok) 401
   */
  private failure(f: Failure, now: Date, inSession = false) {
    if (typeof f === "object") return new HttpException(`Çok fazla hatalı kod. ${trDuration(f.lockedUntil.getTime() - now.getTime())} sonra tekrar deneyin.`, HttpStatus.TOO_MANY_REQUESTS);
    switch (f) {
      case "expired":
        return new UnauthorizedException("Doğrulama süresi doldu; yeniden giriş yapın.");
      case "reused": {
        const m = "Bu kod az önce kullanıldı; uygulamada yeni kodun çıkmasını bekleyin.";
        return inSession ? new BadRequestException(m) : new UnauthorizedException(m);
      }
      case "code-required":
        return new ForbiddenException("Cihaz değiştirmek için mevcut uygulamadaki kodu ya da bir kurtarma kodunu girin.");
      case "no-pending":
        return new ConflictException("Önce kurulumu başlatın.");
      case "pending-expired":
        return new ConflictException("Kurulumun süresi doldu (10 dakika); yeniden başlatın.");
      case "pending-exhausted":
        return new HttpException("Çok fazla hatalı kod; kurulumu yeniden başlatın.", HttpStatus.TOO_MANY_REQUESTS);
      default:
        return inSession ? new BadRequestException("Kod hatalı") : new UnauthorizedException("Kod hatalı");
    }
  }
}
