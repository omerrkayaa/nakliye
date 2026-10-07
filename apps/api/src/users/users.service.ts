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

const PG_UNIQUE_VIOLATION = "23505";

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly auth: AuthService,
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

  async updateMe(userId: string, input: UpdateMeInput) {
    await this.db.update(users).set({ name: input.name }).where(eq(users.id, userId));
    return this.getMe(userId);
  }

  /** Rol ekler (FR-02); var olan rol tekrar eklenirse sessizce geçilir. Güncel rollerle yeni erişim belirteci döner. */
  async addRoles(userId: string, input: AddRolesInput) {
    await this.db
      .insert(userRoles)
      .values(input.roles.map((role) => ({ userId, role })))
      .onConflictDoNothing();
    const roles = await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    return { roles: roles.map((r) => r.role), accessToken: await this.auth.accessTokenFor(userId) };
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
    const [current] = await this.db.select().from(companies).where(eq(companies.ownerUserId, userId));
    if (!current) throw new NotFoundException("Kayıtlı firma yok");

    // Onaylı firmanın kimlik bilgisi değişirse onay düşer; yönetici yeniden onaylamalı (BR-10, F2).
    const identityChanged =
      (input.title !== undefined && input.title !== current.title) ||
      (input.taxNo !== undefined && input.taxNo !== current.taxNo);
    const [company] = await this.db
      .update(companies)
      .set({ ...input, ...(identityChanged ? { verifiedAt: null } : {}) })
      .where(eq(companies.id, current.id))
      .returning();
    return this.companyView(company!);
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
