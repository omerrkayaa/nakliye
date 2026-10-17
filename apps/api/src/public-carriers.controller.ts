import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { VEHICLE_SIZE_ORDER } from "@nakliye/shared";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { DB, type Db } from "./db/db.module.js";
import { companies, userRoles, users, vehicles } from "./db/schema.js";
import { TrustService } from "./ratings/trust.service.js";

const id = z.string().uuid();

/**
 * Herkese açık nakliyeci profili (web /nakliyeci/<firma id>); girişsiz. Karar 2026-10-17: isteğe bağlı —
 * nakliyeci kendisi açar (companies.public_profile). Gösterilen: firma unvanı, doğrulama seviyesi, firma onayı, üyelik,
 * puan ve tamamlanan iş (TrustService.reputationMany, yük akışı kartıyla aynı kural), araç ve kasa tipleri.
 * Gösterilmeyen: telefon, kişi adı, plaka, vergi no, adres. Profil kapalı, hesap askıda/silinmiş ya da nakliyeci değilse 404.
 */
@Controller("public/carriers")
export class PublicCarriersController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly trust: TrustService,
  ) {}

  @Get(":id")
  async show(@Param("id") param: string) {
    const notFound = new NotFoundException("Profil bulunamadı");
    if (!id.safeParse(param).success) throw notFound;
    const [row] = await this.db
      .select({
        companyId: companies.id,
        title: companies.title,
        verifiedAt: companies.verifiedAt,
        userId: users.id,
        verificationLevel: users.verificationLevel,
        memberSince: users.createdAt,
      })
      .from(companies)
      .innerJoin(users, eq(users.id, companies.ownerUserId))
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, "carrier")))
      .where(and(eq(companies.id, param), eq(companies.publicProfile, true), eq(users.status, "aktif")));
    if (!row) throw notFound;

    const rep = (await this.trust.reputationMany([row.userId])).get(row.userId)!;
    const fleet = await this.db
      .select({ vehicleType: vehicles.vehicleType, bodyType: vehicles.bodyType })
      .from(vehicles)
      .where(and(eq(vehicles.ownerUserId, row.userId), ne(vehicles.status, "silindi")));
    // Tip başına araç sayısı ve kasa tipleri; büyükten küçüğe (tır önce)
    const byType = new Map<string, { count: number; bodyTypes: Set<string> }>();
    for (const v of fleet) {
      const t = byType.get(v.vehicleType) ?? { count: 0, bodyTypes: new Set() };
      t.count++;
      t.bodyTypes.add(v.bodyType);
      byType.set(v.vehicleType, t);
    }
    return {
      id: row.companyId,
      title: row.title,
      verificationLevel: row.verificationLevel,
      companyVerified: row.verifiedAt !== null,
      memberSince: row.memberSince,
      rating: rep.rating,
      ratingCount: rep.ratingCount,
      completedJobs: rep.completedJobs,
      vehicles: [...VEHICLE_SIZE_ORDER]
        .reverse()
        .filter((t) => byType.has(t))
        .map((t) => ({ vehicleType: t, count: byType.get(t)!.count, bodyTypes: [...byType.get(t)!.bodyTypes].sort() })),
    };
  }
}
