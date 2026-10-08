import { describe, expect, it } from "vitest";
import { MATCH_NOTIFICATION_TYPES } from "../src/constants.js";
import { createRouteAlertSchema, updateRouteAlertSchema } from "../src/schemas.js";

describe("rota alarmı şemaları (FR-22)", () => {
  it("varsayılanlar: kalkış 50 km, varış her yer (80 km), her araç tipi", () => {
    expect(createRouteAlertSchema.parse({ originDistrictId: 901 })).toEqual({
      originDistrictId: 901,
      originRadiusKm: 50,
      destDistrictId: null,
      destRadiusKm: 80,
      vehicleType: null,
    });
  });

  it("yarıçap 10–200 km tam sayı", () => {
    expect(createRouteAlertSchema.safeParse({ originDistrictId: 901, originRadiusKm: 9 }).success).toBe(false);
    expect(createRouteAlertSchema.safeParse({ originDistrictId: 901, destRadiusKm: 201 }).success).toBe(false);
    expect(createRouteAlertSchema.safeParse({ originDistrictId: 901, originRadiusKm: 25.5 }).success).toBe(false);
    expect(createRouteAlertSchema.safeParse({ originDistrictId: 901, originRadiusKm: 200 }).success).toBe(true);
  });

  it("kalkış zorunlu, araç tipi bilinen tiplerden", () => {
    expect(createRouteAlertSchema.safeParse({ destDistrictId: 3401 }).success).toBe(false);
    expect(createRouteAlertSchema.safeParse({ originDistrictId: 901, vehicleType: "ucak" }).success).toBe(false);
  });

  it("güncelleme: boş gövde reddedilir, tek alan yeter", () => {
    expect(updateRouteAlertSchema.safeParse({}).success).toBe(false);
    expect(updateRouteAlertSchema.parse({ active: false })).toEqual({ active: false });
  });

  it("alarm bildirimleri saatlik eşleşme sınırına girer (BR-22)", () => {
    expect(MATCH_NOTIFICATION_TYPES).toContain("route_alert");
  });
});
