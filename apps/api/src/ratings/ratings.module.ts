import { Module } from "@nestjs/common";
import { RatingsController } from "./ratings.controller.js";
import { RatingsService } from "./ratings.service.js";
import { TrustService } from "./trust.service.js";

/** Puanlama + güven skoru (FR-40…42, BR-30, BR-31). İş modülü skoru yeniletmek için TrustService'i kullanır. */
@Module({
  controllers: [RatingsController],
  providers: [RatingsService, TrustService],
  exports: [RatingsService, TrustService],
})
export class RatingsModule {}
