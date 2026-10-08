import { describe, expect, it } from "vitest";
import { trustScore, isVerifiedBadge, smoothedStars } from "../src/rules/trust.js";
import { estimatePrice } from "../src/rules/price.js";
import { createLoadSchema, phoneSchema, plateSchema } from "../src/schemas.js";

describe("trustScore (BR-30)", () => {
  const fresh = { avgStars: null, ratingCount: 0, completedJobs: 0, verificationLevel: 0 as const, cancelRate: 0, reportRate: 0 };

  it("yeni üyeye nötr ama düşük bir başlangıç verir", () => {
    expect(trustScore(fresh)).toBe(0.25);
  });

  it("tamamlanmış iş, iyi puan ve doğrulama skoru yükseltir", () => {
    const veteran = { avgStars: 4.8, ratingCount: 40, completedJobs: 50, verificationLevel: 2 as const, cancelRate: 0.02, reportRate: 0 };
    expect(trustScore(veteran)).toBeGreaterThan(0.85);
  });

  it("iptal oranı skoru düşürür ve sonuç 0–1 aralığında kalır", () => {
    const bad = { ...fresh, avgStars: 1, ratingCount: 3, cancelRate: 1, reportRate: 1 };
    expect(trustScore(bad)).toBe(0);
  });

  it("tek puan az puanlı kullanıcıyı sert oynatmaz (Bayes ortalaması)", () => {
    const one = (stars: number) => trustScore({ ...fresh, avgStars: stars, ratingCount: 1, completedJobs: 1 });
    // Düz ortalamada tek 1 yıldız 0,055'e, tek 5 yıldız 0,555'e götürüyordu
    expect(one(1)).toBeGreaterThan(0.15);
    expect(one(5)).toBeLessThan(0.45);
    expect(one(5)).toBeGreaterThan(one(1));
  });

  it("puan sayısı arttıkça gerçek ortalamaya yaklaşır", () => {
    expect(smoothedStars(null, 0)).toBe(3);
    expect(smoothedStars(5, 1)).toBe(3.5);
    expect(smoothedStars(5, 97)).toBeCloseTo(4.94, 2);
  });

  it("rozet seviye 1'den itibaren verilir", () => {
    expect(isVerifiedBadge(0)).toBe(false);
    expect(isVerifiedBadge(1)).toBe(true);
  });
});

describe("estimatePrice (F7)", () => {
  it("aralık maliyetin üstünde ve yuvarlanmış olur", () => {
    const p = estimatePrice(600, "tir", 1500);
    expect(p.min).toBeGreaterThan(p.cost);
    expect(p.max).toBeGreaterThan(p.min);
    expect(p.min % 500).toBe(0);
  });

  it("küçük araç daha ucuzdur", () => {
    expect(estimatePrice(600, "kamyonet").cost).toBeLessThan(estimatePrice(600, "tir").cost);
  });
});

describe("şemalar", () => {
  it("telefonu +90 biçimine çevirir", () => {
    expect(phoneSchema.parse("0532 123 45 67")).toBe("+905321234567");
    expect(phoneSchema.parse("+90 (532) 123-45-67")).toBe("+905321234567");
    expect(phoneSchema.safeParse("0212 123 45 67").success).toBe(false);
  });

  it("plakayı normalleştirir ve doğrular", () => {
    expect(plateSchema.parse("09 abc 123")).toBe("09ABC123");
    expect(plateSchema.safeParse("99 A 1").success).toBe(false);
  });

  it("sabit fiyatlı ilanda tutar zorunludur", () => {
    const base = {
      originDistrictId: 1,
      destDistrictId: 2,
      loadFrom: "2026-10-09",
      loadTo: "2026-10-09",
      cargoType: "palet",
      weightTon: 10,
      vehicleType: "tir",
      bodyType: null,
      priceType: "sabit",
      price: null,
    };
    expect(createLoadSchema.safeParse(base).success).toBe(false);
    expect(createLoadSchema.safeParse({ ...base, price: 20000 }).success).toBe(true);
    expect(createLoadSchema.safeParse({ ...base, priceType: "teklif" }).success).toBe(true);
  });
});
