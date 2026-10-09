import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { isVerifiedBadge } from "@nakliye/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { DB, type Db } from "../db/db.module.js";
import { companies, favoriteCarriers, jobs, users } from "../db/schema.js";
import { TrustService } from "../ratings/trust.service.js";

/**
 * P7 "Nakliyecilerim": yük sahibinin daha önce iş yaptığı nakliyeciler ve favorileri. Numara açık (iş yapılmış,
 * FR-32). Favori yalnız birlikte iş yapılmış nakliyeciye eklenebilir (rastgele kullanıcıya bildirim gönderilemesin).
 */
@Injectable()
export class CarriersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly trust: TrustService,
  ) {}

  async list(shipperId: string) {
    const rows = await this.db
      .select({
        id: jobs.carrierId,
        name: users.name,
        phone: users.phone,
        level: users.verificationLevel,
        company: companies.title,
        jobs: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${jobs.status} = 'tamamlandi')::int`,
        lastJobAt: sql<string>`max(${jobs.createdAt})`,
        favorite: sql<boolean>`exists (select 1 from ${favoriteCarriers} f where f.shipper_id = ${shipperId} and f.carrier_id = ${jobs.carrierId})`,
      })
      .from(jobs)
      .innerJoin(users, eq(users.id, jobs.carrierId))
      .leftJoin(companies, eq(companies.ownerUserId, jobs.carrierId))
      .where(eq(jobs.shipperId, shipperId))
      .groupBy(jobs.carrierId, users.name, users.phone, users.verificationLevel, companies.title)
      .orderBy(desc(sql`exists (select 1 from ${favoriteCarriers} f where f.shipper_id = ${shipperId} and f.carrier_id = ${jobs.carrierId})`), desc(sql`max(${jobs.createdAt})`));
    const rep = await this.trust.reputationMany(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        id: r.id,
        displayName: r.company ?? r.name,
        phone: r.phone,
        verified: isVerifiedBadge(r.level),
        favorite: r.favorite,
        jobsWithYou: r.jobs,
        completedWithYou: r.completed,
        lastJobAt: new Date(r.lastJobAt).toISOString(),
        // Herkese görünen itibar (görünür puanlar, tüm tamamlanan işler)
        reputation: rep.get(r.id)!,
      })),
    };
  }

  async setFavorite(shipperId: string, carrierId: string, favorite: boolean) {
    if (favorite) {
      const [worked] = await this.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.shipperId, shipperId), eq(jobs.carrierId, carrierId)))
        .limit(1);
      if (!worked) throw new NotFoundException("Bu nakliyeciyle henüz iş yapmadınız");
      await this.db.insert(favoriteCarriers).values({ shipperId, carrierId }).onConflictDoNothing();
    } else {
      await this.db.delete(favoriteCarriers).where(and(eq(favoriteCarriers.shipperId, shipperId), eq(favoriteCarriers.carrierId, carrierId)));
    }
    return { carrierId, favorite };
  }
}
