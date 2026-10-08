import { describe, expect, it } from "vitest";
import { loadShareText, sharePath, shortDay } from "../src/rules/share.js";

const load = {
  origin: { district: "Nazilli", province: "Aydın" },
  dest: { district: "Esenyurt", province: "İstanbul" },
  loadFrom: "2026-10-09",
  loadTo: "2026-10-10",
  cargoType: "palet" as const,
  weightTon: 22,
  vehicleType: "tir" as const,
  priceType: "sabit" as const,
  price: 24000,
};

describe("paylaşım metni (FR-16)", () => {
  it("kısa gün: ay adı Intl'siz", () => {
    expect(shortDay("2026-10-09")).toBe("9 Eki");
    expect(shortDay("2026-01-31")).toBe("31 Oca");
    expect(shortDay("2026-08-01")).toBe("1 Ağu");
  });

  it("güzergâh kalın, tarih aralığı, yük, fiyat, bağlantı", () => {
    expect(loadShareText(load, "https://x.test/ilan/abc")).toBe(
      ["*Nazilli, Aydın → Esenyurt, İstanbul*", "Yükleme: 9 Eki – 10 Eki", "22 ton Palet · Tır", "Fiyat: 24.000 ₺", "Teyitli ilan, ayrıntı: https://x.test/ilan/abc"].join("\n"),
    );
  });

  it("tek gün, teklif usulü, ondalıklı ton (virgül)", () => {
    const t = loadShareText({ ...load, loadTo: load.loadFrom, priceType: "teklif", price: null, weightTon: 12.5 }, "u");
    expect(t).toContain("Yükleme: 9 Eki\n");
    expect(t).toContain("Fiyat: Teklif usulü");
    expect(t).toContain("12,5 ton");
  });

  it("büyük fiyat binlik ayraçla; numara yok", () => {
    const t = loadShareText({ ...load, price: 1250000 }, "u");
    expect(t).toContain("1.250.000 ₺");
    expect(t).not.toMatch(/05\d\d|\+90/);
  });

  it("yol", () => expect(sharePath("AbC-12_xyz")).toBe("/ilan/AbC-12_xyz"));
});
