import { describe, expect, it } from "vitest";
import { RATING_TAGS } from "../src/constants.js";
import { RATING_TAGS_FOR, ratingDeadline } from "../src/rules/rating.js";
import { createRatingSchema } from "../src/schemas.js";

describe("puanlama (FR-40)", () => {
  it("süre tamamlanmadan 14 gün sonra biter", () => {
    expect(ratingDeadline(new Date("2026-10-01T10:00:00Z")).toISOString()).toBe("2026-10-15T10:00:00.000Z");
  });

  it("etiketler yöne göre ayrılır ve hepsi tanımlı etiketlerdir", () => {
    expect(RATING_TAGS_FOR.shipper).toContain("odeme_sorunsuz");
    expect(RATING_TAGS_FOR.carrier).not.toContain("odeme_sorunsuz");
    expect(RATING_TAGS_FOR.carrier).toContain("yuk_ozenli");
    expect(RATING_TAGS_FOR.shipper).not.toContain("yuk_ozenli");
    for (const t of [...RATING_TAGS_FOR.shipper, ...RATING_TAGS_FOR.carrier]) expect(RATING_TAGS).toHaveProperty(t);
  });

  it("şema: bilinmeyen etiketi ve 1–5 dışını reddeder, tekrarı teke indirir", () => {
    expect(createRatingSchema.safeParse({ stars: 5, tags: ["uydurma"] }).success).toBe(false);
    expect(createRatingSchema.safeParse({ stars: 0 }).success).toBe(false);
    expect(createRatingSchema.safeParse({ stars: 6 }).success).toBe(false);
    expect(createRatingSchema.safeParse({ stars: 4.5 }).success).toBe(false);
    const ok = createRatingSchema.parse({ stars: 4, tags: ["zamaninda", "zamaninda"], comment: "  iyi  " });
    expect(ok.tags).toEqual(["zamaninda"]);
    expect(ok.comment).toBe("iyi");
  });
});
