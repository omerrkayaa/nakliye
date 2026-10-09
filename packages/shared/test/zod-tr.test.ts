import { describe, expect, it } from "vitest";
import { z } from "zod";
// Paketin giriş noktası: Türkçe hata haritası içe aktarılınca kurulur (API, web ve mobil bu yoldan alır)
import { createLoadSchema, createVehicleSchema, suspendUserSchema } from "../src/index.js";

const messages = (r: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));

describe("Türkçe zod hata mesajları", () => {
  it("boş form: zorunlu alan, sayı ve seçim mesajları Türkçe", () => {
    const m = messages(createLoadSchema.safeParse({ weightTon: Number.NaN, cargoType: "yok" }));
    expect(m.originDistrictId).toBe("Bu alan zorunlu");
    expect(m.weightTon).toBe("Sayı girin");
    expect(m.cargoType).toBe("Listeden bir seçenek seçin");
    expect(Object.values(m).join(" ")).not.toMatch(/Expected|Required|Invalid/);
  });

  it("sayı sınırları", () => {
    const m = messages(createVehicleSchema.safeParse({ plate: "34 ABC 123", vehicleType: "tir", bodyType: "tenteli", capacityTon: 500 }));
    expect(m.capacityTon).toMatch(/^En fazla \d+ olabilir$/);
  });

  it("tam sayı", () => {
    expect(z.number().int().safeParse(1.5).error?.issues[0]?.message).toBe("Tam sayı girin");
  });

  it("şemanın kendi mesajı korunur", () => {
    expect(messages(suspendUserSchema.safeParse({ reason: "kısa" })).reason).toBe("Sebebi en az 5 karakterle yazın");
  });
});
