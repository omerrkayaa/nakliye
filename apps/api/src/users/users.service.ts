import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
  isVerifiedBadge,
  type AddRolesInput,
  type CreateCompanyInput,
  type UpdateCompanyInput,
  type UpdateMeInput,
} from "@nakliye/shared";
import { and, eq, isNull } from "drizzle-orm";
import { AuthService } from "../auth/auth.service.js";
import { DB, type Db } from "../db/db.module.js";
import { companies, userRoles, users } from "../db/schema.js";
import { TrustService } from "../ratings/trust.service.js";

const PG_UNIQUE_VIOLATION = "23505";

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly auth: AuthService,
    private readonly trust: TrustService,
  ) {}

  async getMe(userId: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!user) throw new UnauthorizedException("Hesap bulunamadı");

    const roles = await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    const [company] = await this.db.select().from(companies).where(eq(companies.ownerUserId, userId));

    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      roles: roles.map((r) => r.role),
      verificationLevel: user.verificationLevel,
      verified: isVerifiedBadge(user.verificationLevel),
      trustScore: user.trustScore,
      status: user.status,
      createdAt: user.createdAt,
      company: company ? this.companyView(company) : null,
    };
  }

  /**
   * Yönetim bölümü için (NFR-04): "tamam" = bu oturum ikinci adımı geçti (belirteçte yönetici rolü var); "kurulum" =
   * doğrulama uygulaması kurulmamış; "giris" = kurulu ama oturum ikinci adımsız (çıkıp yeniden girilmeli). Yönetici değilse null.
   */
  async adminMfa(userId: string, dbRoles: string[], tokenRoles: string[]): Promise<"tamam" | "kurulum" | "giris" | null> {
    if (!dbRoles.includes("admin")) return null;
    if (tokenRoles.includes("admin")) return "tamam";
    return (await this.auth.totpEnabled(userId)) ? "giris" : "kurulum";
  }

  async updateMe(userId: string, input: UpdateMeInput) {
    await this.db.update(users).set({ name: input.name }).where(eq(users.id, userId));
    return this.getMe(userId);
  }

  /** Rol ekler (FR-02); var olan rol tekrar eklenirse sessizce geçilir. Güncel rollerle yeni erişim belirteci döner. */
  async addRoles(userId: string, input: AddRolesInput, mfaAt: Date | null = null) {
    await this.db
      .insert(userRoles)
      .values(input.roles.map((role) => ({ userId, role })))
      .onConflictDoNothing();
    const roles = await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    // Seviye rollere bağlı (BR-10: nakliyecide ruhsat, yük sahibinde vergi levhası sayılır)
    await this.trust.refresh(userId);
    return { roles: roles.map((r) => r.role), accessToken: await this.auth.accessTokenFor(userId, mfaAt) };
  }

  async createCompany(userId: string, input: CreateCompanyInput) {
    try {
      const [company] = await this.db
        .insert(companies)
        .values({ ownerUserId: userId, ...input })
        .returning();
      return this.companyView(company!);
    } catch (e) {
      // drizzle, pg hatasını `cause` içine sarabiliyor
      const err = e as { code?: string; cause?: { code?: string } };
      if ((err.cause?.code ?? err.code) === PG_UNIQUE_VIOLATION) {
        throw new ConflictException("Zaten kayıtlı bir firmanız var; değiştirmek için PATCH /companies kullanın");
      }
      throw e;
    }
  }

  async updateCompany(userId: string, input: UpdateCompanyInput) {
    // Satır kilitli: vergi levhası onayıyla yarışta okunan "onaylı mı" bilgisi bayat kalmasın
    const { company, identityChanged } = await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(companies).where(eq(companies.ownerUserId, userId)).for("update");
      if (!current) throw new NotFoundException("Kayıtlı firma yok");
      // Onaylı firmanın kimlik bilgisi değişirse onay düşer; yönetici yeniden onaylamalı (BR-10, F2).
      const changed =
        (input.title !== undefined && input.title !== current.title) ||
        (input.taxNo !== undefined && input.taxNo !== current.taxNo);
      const [row] = await tx
        .update(companies)
        .set({ ...input, ...(changed ? { verifiedAt: null } : {}) })
        .where(eq(companies.id, current.id))
        .returning();
      return { company: row!, identityChanged: changed };
    });
    if (identityChanged) await this.trust.refresh(userId);
    return this.companyView(company);
  }

  private companyView(c: typeof companies.$inferSelect) {
    return {
      id: c.id,
      title: c.title,
      taxNo: c.taxNo,
      taxOffice: c.taxOffice,
      address: c.address,
      verified: c.verifiedAt !== null,
      verifiedAt: c.verifiedAt,
      createdAt: c.createdAt,
    };
  }
}
