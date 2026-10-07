import { describe, expect, it } from "vitest";
import { canTransition, loadDateError, needsModeration, trDay, trDayEnd, trDayStart } from "../src/rules/load.js";
import { loadSearchSchema, updateLoadSchema } from "../src/schemas.js";

describe("ilan şemaları", () => {
  it("near parametresini enlem/boylama ayırır, geçersiz konumu reddeder", () => {
    expect(loadSearchSchema.parse({ near: "37.85,27.84" }).near).toEqual({ lat: 37.85, lng: 27.84 });
    expect(loadSearchSchema.safeParse({ near: "99,27" }).success).toBe(false);
  });

  it("düzenlemede kalkış/varış değiştirilemez, boş düzenleme reddedilir", () => {
    expect(updateLoadSchema.safeParse({ originDistrictId: 3501, note: "x" }).success).toBe(false);
    expect(updateLoadSchema.parse({ note: "x" })).toEqual({ note: "x" });
    expect(updateLoadSchema.safeParse({}).success).toBe(false);
  });
});

describe("Türkiye günü", () => {
  it("UTC gece yarısından önce TR'de ertesi gün başlamış olur", () => {
    expect(trDay(new Date("2026-10-07T20:59:59Z"))).toBe("2026-10-07");
    expect(trDay(new Date("2026-10-07T21:00:00Z"))).toBe("2026-10-08");
  });

  it("gün başı ve sonu TR saatine göredir", () => {
    expect(trDayStart("2026-10-08").toISOString()).toBe("2026-10-07T21:00:00.000Z");
    expect(trDayEnd("2026-10-08").toISOString()).toBe("2026-10-08T20:59:59.999Z");
  });
});

describe("loadDateError", () => {
  const now = new Date("2026-10-07T10:00:00Z"); // TR: 7 Ekim 13:00

  it("bugün ve ileri tarihleri kabul eder", () => {
    expect(loadDateError("2026-10-07", "2026-10-07", now)).toBeNull();
    expect(loadDateError("2026-10-10", "2026-10-12", now)).toBeNull();
  });

  it("geçmiş, ters, çok uzak ve çok uzun aralıkları reddeder", () => {
    expect(loadDateError("2026-10-05", "2026-10-06", now)).toMatch(/geçmişte/);
    expect(loadDateError("2026-10-10", "2026-10-09", now)).toMatch(/önce olamaz/);
    expect(loadDateError("2026-12-07", "2026-12-07", now)).toMatch(/60 gün/);
    expect(loadDateError("2026-10-08", "2026-11-08", now)).toMatch(/30 gün/);
  });

  it("aralık bugün bitiyorsa geçerlidir (dünden başlasa bile)", () => {
    expect(loadDateError("2026-10-06", "2026-10-07", now)).toBeNull();
  });
});

describe("durum makinesi", () => {
  it("diyagramdaki geçişlere izin verir", () => {
    expect(canTransition("moderasyonda", "teyitli")).toBe(true);
    expect(canTransition("teyitli", "teyit_bekliyor")).toBe(true);
    expect(canTransition("teyit_bekliyor", "teyitli")).toBe(true);
    expect(canTransition("teyitli", "kapandi")).toBe(true);
  });

  it("son durumlardan çıkışa ve moderasyonu atlamaya izin vermez", () => {
    expect(canTransition("suresi_doldu", "teyitli")).toBe(false);
    expect(canTransition("kapandi", "teyitli")).toBe(false);
    expect(canTransition("iptal", "teyitli")).toBe(false);
    expect(canTransition("moderasyonda", "kapandi")).toBe(false);
  });
});

describe("needsModeration (BR-11)", () => {
  it("seviye 0 yük sahibinin ilk 3 onaylı ilanı moderasyona girer", () => {
    expect(needsModeration(0, 0)).toBe(true);
    expect(needsModeration(0, 2)).toBe(true);
    expect(needsModeration(0, 3)).toBe(false);
  });

  it("doğrulanmış yük sahibi moderasyona girmez", () => {
    expect(needsModeration(1, 0)).toBe(false);
  });
});

describe("dateRangeError (boş araç müsaitliği)", () => {
  it("mesajda verilen adı kullanır", async () => {
    const { dateRangeError } = await import("../src/rules/load.js");
    expect(dateRangeError("2026-10-01", "2026-10-02", new Date("2026-10-07T10:00:00Z"), undefined, "Müsaitlik")).toBe(
      "Müsaitlik tarihi geçmişte olamaz",
    );
  });
});
