import { describe, expect, it } from "vitest";
import { canJobTransition, deliveryCodeSmsText, vehicleFitError } from "../src/rules/job.js";
import { cancelJobSchema, jobStatusSchema } from "../src/schemas.js";

describe("iş durum makinesi (FR-33, BR-31, BR-32)", () => {
  it("nakliyeci ileri taşır, geri alamaz", () => {
    expect(canJobTransition("anlasildi", "yuklendi", "carrier")).toBe(true);
    expect(canJobTransition("yuklendi", "yolda", "carrier")).toBe(true);
    expect(canJobTransition("yolda", "yuklendi", "carrier")).toBe(false);
  });

  it("teslimi yalnız nakliyeci yapar (kodla), ara adım atlanabilir", () => {
    expect(canJobTransition("anlasildi", "teslim_edildi", "carrier")).toBe(true);
    expect(canJobTransition("yolda", "teslim_edildi", "shipper")).toBe(false);
  });

  it("yük sahibi elle tamamlar ve teslimden sonra itiraz eder; nakliyeci tamamlayamaz", () => {
    expect(canJobTransition("yolda", "tamamlandi", "shipper")).toBe(true);
    expect(canJobTransition("teslim_edildi", "itirazli", "shipper")).toBe(true);
    expect(canJobTransition("teslim_edildi", "tamamlandi", "carrier")).toBe(false);
    expect(canJobTransition("yolda", "itirazli", "shipper")).toBe(false);
  });

  it("iptal teslimden önce iki taraf için de mümkün, sonra değil", () => {
    expect(canJobTransition("yuklendi", "iptal", "carrier")).toBe(true);
    expect(canJobTransition("anlasildi", "iptal", "shipper")).toBe(true);
    expect(canJobTransition("teslim_edildi", "iptal", "carrier")).toBe(false);
  });

  it("otomatik tamamlama yalnız teslimden sonra; son durumlardan çıkış yok", () => {
    expect(canJobTransition("teslim_edildi", "tamamlandi", "system")).toBe(true);
    expect(canJobTransition("yolda", "tamamlandi", "system")).toBe(false);
    expect(canJobTransition("tamamlandi", "iptal", "shipper")).toBe(false);
    expect(canJobTransition("iptal", "anlasildi", "system")).toBe(false);
  });

  it("itirazı yalnız yönetici çözer: tamamlandı ya da iptal", () => {
    expect(canJobTransition("itirazli", "tamamlandi", "admin")).toBe(true);
    expect(canJobTransition("itirazli", "iptal", "admin")).toBe(true);
    expect(canJobTransition("itirazli", "tamamlandi", "shipper")).toBe(false);
    expect(canJobTransition("itirazli", "iptal", "carrier")).toBe(false);
    expect(canJobTransition("itirazli", "tamamlandi", "system")).toBe(false);
    expect(canJobTransition("teslim_edildi", "tamamlandi", "admin")).toBe(false);
  });
});

describe("vehicleFitError (FR-30)", () => {
  const load = { vehicleType: "tir" as const, bodyType: "tenteli" as const, weightTon: 20 };
  it("uygun aracı kabul eder", () => {
    expect(vehicleFitError(load, { vehicleType: "tir", bodyType: "tenteli", capacityTon: 25 })).toBeNull();
    expect(vehicleFitError({ ...load, bodyType: null }, { vehicleType: "tir", bodyType: "frigo", capacityTon: 25 })).toBeNull();
  });
  it("büyük araç küçük tip isteyen ilana uyar (kapasite yeterse), küçük araç büyüğe uymaz", () => {
    const small = { vehicleType: "kamyonet" as const, bodyType: null, weightTon: 3 };
    expect(vehicleFitError(small, { vehicleType: "kamyon", bodyType: "tenteli", capacityTon: 12 })).toBeNull();
    expect(vehicleFitError(small, { vehicleType: "tir", bodyType: "tenteli", capacityTon: 25 })).toBeNull();
    expect(vehicleFitError({ ...small, vehicleType: "kamyon" }, { vehicleType: "kamyonet", bodyType: "tenteli", capacityTon: 12 })).toMatch(/küçük/);
    expect(vehicleFitError({ ...small, weightTon: 3 }, { vehicleType: "kamyon", bodyType: "tenteli", capacityTon: 2 })).toMatch(/kapasite/);
  });
  it("tip, kasa ve kapasite uyuşmazlığını söyler", () => {
    expect(vehicleFitError(load, { vehicleType: "panelvan", bodyType: "tenteli", capacityTon: 25 })).toMatch(/Araç tipi/);
    expect(vehicleFitError(load, { vehicleType: "tir", bodyType: "frigo", capacityTon: 25 })).toMatch(/Kasa/);
    expect(vehicleFitError(load, { vehicleType: "tir", bodyType: "tenteli", capacityTon: 10 })).toMatch(/kapasite/);
  });
});

describe("iş şemaları ve SMS", () => {
  it("nakliyeci durum güncellemesiyle teslim edemez/tamamlayamaz", () => {
    expect(jobStatusSchema.safeParse({ status: "yolda" }).success).toBe(true);
    expect(jobStatusSchema.safeParse({ status: "teslim_edildi" }).success).toBe(false);
  });
  it("iptal sebebi zorunlu", () => {
    expect(cancelJobSchema.safeParse({ reason: "  " }).success).toBe(false);
  });
  it("teslim kodu SMS'i tek parça ve ASCII", () => {
    const t = deliveryCodeSmsText("123456");
    expect(t.length).toBeLessThanOrEqual(160);
    expect(t).toMatch(/^[\x20-\x7E]+$/);
  });
});
