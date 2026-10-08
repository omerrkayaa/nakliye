import { Injectable } from "@nestjs/common";
import { JobsService } from "../jobs/jobs.service.js";
import { OffersService } from "../jobs/offers.service.js";
import { ConfirmationService } from "../loads/confirmation.service.js";
import { MatchingService } from "../matching/matching.service.js";
import { RatingsService } from "../ratings/ratings.service.js";
import { CapacityService } from "../vehicles/capacity.service.js";

export interface TickStats {
  /** Yük ilanı: teyitli → teyit bekliyor / süresi doldu (BR-03, BR-04) */
  statusChanged: number;
  /** "Hâlâ geçerli mi?" soruları (BR-02) */
  reminded: number;
  /** Push'a cevap gelmediği için giden SMS'ler */
  smsSent: number;
  /** Müsaitlik tarihi geçen boş araç ilanları */
  capacityExpired: number;
  /** Süpürmede eşleştirilen (gözden kaçmış) ilanlar */
  matchSwept: number;
  /** Yayından kalkmış ilanlarda sonuçlanan bekleyen teklifler */
  offersClosed: number;
  /** Teslimden 48 saat sonra otomatik tamamlanan işler (BR-32) */
  jobsCompleted: number;
  /** Puanlama süresi bittiği için görünür olan (kör) puanlar */
  ratingsRevealed: number;
}

/** Periyodik görevlerin tek turu. Her adım tekrar çalıştırılabilir (idempotent). */
@Injectable()
export class SchedulerService {
  constructor(
    private readonly confirmation: ConfirmationService,
    private readonly capacity: CapacityService,
    private readonly matching: MatchingService,
    private readonly offers: OffersService,
    private readonly jobs: JobsService,
    private readonly ratings: RatingsService,
  ) {}

  async tick(now = new Date()): Promise<TickStats> {
    const confirmation = await this.confirmation.tick(now);
    const capacityExpired = await this.capacity.expire(now);
    // Süpürme en sonda: düşen/süresi dolan ilanlar artık eşleştirilmez
    const matchSwept = await this.matching.sweep(now);
    const offersClosed = await this.offers.rejectStale();
    const jobsCompleted = await this.jobs.autoComplete(now);
    const ratingsRevealed = await this.ratings.revealExpired(now);
    return { ...confirmation, capacityExpired, matchSwept, offersClosed, jobsCompleted, ratingsRevealed };
  }
}
