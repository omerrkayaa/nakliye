import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIRMATION_PARAMS } from "../src/rules/confirmation.js";
import { DEFAULT_MATCH_PARAMS } from "../src/rules/matching.js";
import { DEFAULT_PRICE_PARAMS, roadEstimate } from "../src/rules/price.js";
import { SETTING_KEYS, SETTINGS, confirmationParamsSchema, matchParamsSchema, priceParamsSchema, settingsDiff } from "../src/rules/settings.js";
import "../src/zod-tr.js";

const messages = (r: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) =>
  (r.error?.issues ?? []).map((i) => `${i.path.join(".")}: ${i.message}`);

describe("FR-54 ayar şemaları", () => {
  it("varsayılanlar kendi şemalarından geçer (yoksa panel ilk açılışta kaydedilemezdi)", () => {
    for (const k of SETTING_KEYS) expect(SETTINGS[k].schema.safeParse(SETTINGS[k].defaults).success, k).toBe(true);
  });

  it("formdan gelen metin sayılar sayıya çevrilir", () => {
    const r = confirmationParamsSchema.safeParse(Object.fromEntries(Object.entries(DEFAULT_CONFIRMATION_PARAMS).map(([k, v]) => [k, String(v)])));
    expect(r.success && r.data).toEqual(DEFAULT_CONFIRMATION_PARAMS);
  });

  it("teyit: sınırlar ve aralıklar arası tutarlılık", () => {
    expect(messages(confirmationParamsSchema.safeParse({ ...DEFAULT_CONFIRMATION_PARAMS, reminderIntervalH: 2, loadDayIntervalH: 1 }))).toEqual(["reminderIntervalH: Teyit aralığı en az 6"]);
    expect(messages(confirmationParamsSchema.safeParse({ ...DEFAULT_CONFIRMATION_PARAMS, reminderIntervalH: 8, loadDayIntervalH: 12 }))).toEqual([
      "loadDayIntervalH: Yükleme günü aralığı normal aralıktan uzun olamaz",
    ]);
    expect(messages(confirmationParamsSchema.safeParse({ ...DEFAULT_CONFIRMATION_PARAMS, answerWindowH: 1, smsFallbackMin: 60 }))).toEqual(["smsFallbackMin: SMS yedeği cevap süresinden önce gitmeli"]);
    expect(confirmationParamsSchema.safeParse({ ...DEFAULT_CONFIRMATION_PARAMS, reportThreshold: 2.5 }).success).toBe(false);
  });

  it("eşleştirme: ağırlıkların toplamı 1 (yuvarlama payıyla)", () => {
    expect(messages(matchParamsSchema.safeParse({ ...DEFAULT_MATCH_PARAMS, weights: { ...DEFAULT_MATCH_PARAMS.weights, trust: 0.5 } }))).toEqual(["weights: Ağırlıkların toplamı 1 olmalı"]);
    const thirds = { originProximity: 0.3333, destProximity: 0.3333, dateFit: 0.3334, capacityFill: 0, trust: 0 };
    expect(matchParamsSchema.safeParse({ ...DEFAULT_MATCH_PARAMS, weights: thirds }).success).toBe(true);
    expect(messages(matchParamsSchema.safeParse({ ...DEFAULT_MATCH_PARAMS, originRadiusKm: 0 }))).toEqual(["originRadiusKm: Kalkış yarıçapı en az 5"]);
  });

  it("fiyat: binlik ayırıcı ondalık sanılırsa (3.000 → 3) şoför günlüğü reddedilir", () => {
    expect(messages(priceParamsSchema.safeParse({ ...DEFAULT_PRICE_PARAMS, vehicles: { ...DEFAULT_PRICE_PARAMS.vehicles, tir: { ...DEFAULT_PRICE_PARAMS.vehicles.tir, driverDaily: 3 } } }))).toEqual([
      "vehicles.tir.driverDaily: Tır şoför günlüğü en az 100",
    ]);
  });

  it("fiyat: kâr aralığı, yuvarlama ve beş araç tipinin hepsi", () => {
    expect(messages(priceParamsSchema.safeParse({ ...DEFAULT_PRICE_PARAMS, marginMin: 1.4, marginMax: 1.2 }))).toEqual(["marginMax: En yüksek kâr çarpanı en düşükten küçük olamaz"]);
    expect(messages(priceParamsSchema.safeParse({ ...DEFAULT_PRICE_PARAMS, roundTo: 300 }))).toEqual(["roundTo: Yuvarlama 50, 100, 250, 500 ya da 1000 olmalı"]);
    const { panelvan: _p, ...missing } = DEFAULT_PRICE_PARAMS.vehicles;
    expect(priceParamsSchema.safeParse({ ...DEFAULT_PRICE_PARAMS, vehicles: missing }).success).toBe(false);
    expect(messages(priceParamsSchema.safeParse({ ...DEFAULT_PRICE_PARAMS, vehicles: { ...DEFAULT_PRICE_PARAMS.vehicles, tir: { ...DEFAULT_PRICE_PARAMS.vehicles.tir, fuelLitersPer100Km: 0 } } }))).toEqual([
      "vehicles.tir.fuelLitersPer100Km: Tır yakıt tüketimi en az 1",
    ]);
  });

  it("geçerli fiyat ayarı tahmini değiştirir (yakıt fiyatı iki katı → aralık yükselir)", () => {
    const pricier = priceParamsSchema.parse({ ...DEFAULT_PRICE_PARAMS, fuelPricePerLiter: DEFAULT_PRICE_PARAMS.fuelPricePerLiter * 2 });
    const a = roadEstimate(500, "tir"), b = roadEstimate(500, "tir", pricier);
    expect(b.min).toBeGreaterThan(a.min);
    expect(b.max).toBeGreaterThan(a.max);
  });
});

describe("settingsDiff (işlem kaydı notu)", () => {
  it("yalnız değişen yaprakları yolu ve eski → yeni değerle verir", () => {
    const after = { ...DEFAULT_PRICE_PARAMS, fuelPricePerLiter: 65, vehicles: { ...DEFAULT_PRICE_PARAMS.vehicles, tir: { ...DEFAULT_PRICE_PARAMS.vehicles.tir, wearPerKm: 10 } } };
    expect(settingsDiff(DEFAULT_PRICE_PARAMS, after)).toEqual(["Motorin fiyatı (₺/L): 60 → 65", "Tır aşınma, bakım (₺/km): 9 → 10"]);
    const driver = { ...DEFAULT_PRICE_PARAMS, vehicles: { ...DEFAULT_PRICE_PARAMS.vehicles, kamyonet: { ...DEFAULT_PRICE_PARAMS.vehicles.kamyonet, driverDaily: 2500 } }, marginMin: 1.2 };
    expect(settingsDiff(DEFAULT_PRICE_PARAMS, driver)).toEqual(["Kâr çarpanı (alt): 1,15 → 1,2", "Kamyonet şoför (₺/gün): 2.000 → 2.500"]);
    expect(settingsDiff(DEFAULT_MATCH_PARAMS, DEFAULT_MATCH_PARAMS)).toEqual([]);
  });
});
