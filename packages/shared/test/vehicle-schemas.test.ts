import { describe, expect, it } from "vitest";
import { closeCapacitySchema, createVehicleSchema, updateCapacitySchema, updateVehicleSchema } from "../src/schemas.js";

describe("araç şemaları (FR-04)", () => {
  it("plakayı büyük harfe çevirip boşlukları atar", () => {
    const v = createVehicleSchema.parse({ plate: "35 abc 123", vehicleType: "tir", bodyType: "tenteli", capacityTon: 25 });
    expect(v.plate).toBe("35ABC123");
  });

  it("geçersiz il kodlu plakayı reddeder", () => {
    expect(createVehicleSchema.safeParse({ plate: "99 AB 123", vehicleType: "tir", bodyType: "tenteli", capacityTon: 25 }).success).toBe(false);
  });

  it("düzenlemede plaka değiştirilemez, hacim silinebilir", () => {
    expect(updateVehicleSchema.safeParse({ plate: "35ABC124" }).success).toBe(false);
    expect(updateVehicleSchema.parse({ volumeM3: null })).toEqual({ volumeM3: null });
  });
});

describe("boş araç ilanı şemaları (FR-12)", () => {
  it("varış 'her yer' (null) olabilir, araç değiştirilemez", () => {
    expect(updateCapacitySchema.parse({ destDistrictId: null })).toEqual({ destDistrictId: null });
    expect(updateCapacitySchema.safeParse({ vehicleId: "00000000-0000-4000-8000-000000000000" }).success).toBe(false);
  });

  it("kapatma sebebi doldu ya da iptal", () => {
    expect(closeCapacitySchema.safeParse({ reason: "doldu" }).success).toBe(true);
    expect(closeCapacitySchema.safeParse({ reason: "bilmem" }).success).toBe(false);
  });
});
