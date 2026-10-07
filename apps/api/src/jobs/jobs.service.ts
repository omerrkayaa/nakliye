import { Injectable } from "@nestjs/common";
import { ConfirmationService } from "../loads/confirmation.service.js";
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
}

/** Periyodik işlerin tek turu. Her adım tekrar çalıştırılabilir (idempotent). */
@Injectable()
export class JobsService {
  constructor(
    private readonly confirmation: ConfirmationService,
    private readonly capacity: CapacityService,
  ) {}

  async tick(now = new Date()): Promise<TickStats> {
    const confirmation = await this.confirmation.tick(now);
    const capacityExpired = await this.capacity.expire(now);
    return { ...confirmation, capacityExpired };
  }
}
