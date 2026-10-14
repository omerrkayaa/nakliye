import { describe, expect, it } from "vitest";
import { fitRejectReason, matchLoadWithCapacity } from "../src/rules/matching.js";
import { estimatedArrivalDay, onRouteMatch, projectOnPolyline, returnCapacity, returnWindow } from "../src/rules/return-plan.js";

// İl merkezleri (yaklaşık): İstanbul'dan Aydın'a dönüş yolu Bursa – Balıkesir – Manisa üzerinden
const IST = { lat: 41.01, lng: 28.97 };
const BURSA = { lat: 40.19, lng: 29.06 };
const BALIKESIR = { lat: 39.65, lng: 27.88 };
const MANISA = { lat: 38.61, lng: 27.43 };
const AYDIN = { lat: 37.85, lng: 27.84 };
const NAZILLI = { lat: 37.91, lng: 28.32 };
const ANKARA = { lat: 39.93, lng: 32.86 };
const KONYA = { lat: 37.87, lng: 32.48 };
const ROUTE = [IST, BURSA, BALIKESIR, MANISA, AYDIN];

describe("projectOnPolyline", () => {
  it("köşedeki nokta: uzaklık ~0, konum uzunluğa göre", () => {
    const a = projectOnPolyline(IST, ROUTE);
    const b = projectOnPolyline(BALIKESIR, ROUTE);
    const c = projectOnPolyline(AYDIN, ROUTE);
    expect(a.distanceKm).toBeLessThan(0.01);
    expect(a.position).toBe(0);
    expect(b.distanceKm).toBeLessThan(0.01);
    expect(b.position).toBeGreaterThan(0.3);
    expect(b.position).toBeLessThan(0.6);
    expect(c.position).toBeCloseTo(1, 5);
  });
  it("parça ortasının yanındaki nokta: dik uzaklık", () => {
    // İstanbul–Bursa parçasının ortası ~0,1° doğusu ≈ 8–9 km
    const p = projectOnPolyline({ lat: 40.6, lng: 29.12 }, ROUTE);
    expect(p.distanceKm).toBeGreaterThan(5);
    expect(p.distanceKm).toBeLessThan(12);
    expect(p.position).toBeGreaterThan(0);
    expect(p.position).toBeLessThan(0.3);
  });
  it("tek noktalı rota ve boş rota", () => {
    expect(projectOnPolyline(BURSA, [IST]).distanceKm).toBeGreaterThan(80);
    expect(() => projectOnPolyline(BURSA, [])).toThrow();
  });
});

describe("BR-23 rota üstü", () => {
  it("Bursa → Balıkesir dönüş yolunda ve doğru yönde: aday, kapsama ve skor", () => {
    const r = onRouteMatch({ origin: BURSA, dest: BALIKESIR }, ROUTE);
    expect(r.candidate).toBe(true);
    if (!r.candidate) return;
    expect(r.originDevKm).toBeLessThan(1);
    expect(r.coverage).toBeGreaterThan(0.1);
    expect(r.score).toBeGreaterThan(0.4);
  });
  it("uzun yük kısa yükten yüksek skor alır", () => {
    const long = onRouteMatch({ origin: BURSA, dest: MANISA }, ROUTE);
    const short = onRouteMatch({ origin: BURSA, dest: BALIKESIR }, ROUTE);
    expect(long.candidate && short.candidate && long.score > short.score).toBe(true);
  });
  it("ters yön, rotadan uzak kalkış ya da varış aday değil", () => {
    expect(onRouteMatch({ origin: BALIKESIR, dest: BURSA }, ROUTE)).toEqual({ candidate: false, reason: "ters_yon" });
    expect(onRouteMatch({ origin: ANKARA, dest: KONYA }, ROUTE)).toEqual({ candidate: false, reason: "kalkis_rotadan_uzak" });
    expect(onRouteMatch({ origin: BURSA, dest: ANKARA }, ROUTE)).toEqual({ candidate: false, reason: "varis_rotadan_uzak" });
  });
  it("sapma sınırı parametrik (30 km)", () => {
    const near = { lat: 40.6, lng: 29.12 }; // rotaya ~9 km
    expect(onRouteMatch({ origin: near, dest: MANISA }, ROUTE, { kmPerDay: 600, windowDays: 2, routeMaxDeviationKm: 5 }).candidate).toBe(false);
    expect(onRouteMatch({ origin: near, dest: MANISA }, ROUTE).candidate).toBe(true);
  });
});

describe("Tahmini varış ve dönüş penceresi", () => {
  it("teslim edildiyse teslim günü", () => {
    expect(estimatedArrivalDay({ loadFrom: "2026-10-08", roadKm: 590, deliveredDay: "2026-10-12" }, "2026-10-13")).toBe("2026-10-12");
  });
  it("yükleme günü + ⌈km / 600⌉; kısa yolda bir gün, uzun yolda iki", () => {
    expect(estimatedArrivalDay({ loadFrom: "2026-10-08", roadKm: 590, deliveredDay: null }, "2026-10-01")).toBe("2026-10-09");
    expect(estimatedArrivalDay({ loadFrom: "2026-10-08", roadKm: 1100, deliveredDay: null }, "2026-10-01")).toBe("2026-10-10");
    expect(estimatedArrivalDay({ loadFrom: "2026-10-08", roadKm: 0, deliveredDay: null }, "2026-10-01")).toBe("2026-10-08");
  });
  it("tahmini gün geçtiyse (gecikme) bugün", () => {
    expect(estimatedArrivalDay({ loadFrom: "2026-10-01", roadKm: 590, deliveredDay: null }, "2026-10-13")).toBe("2026-10-13");
  });
  it("pencere varış … +2; ay sonunu geçer", () => {
    expect(returnWindow("2026-10-30")).toEqual({ from: "2026-10-30", to: "2026-11-01" });
  });
});

describe("Dönüş yükü (BR-20 sanal araç ilanıyla)", () => {
  const vehicle = { type: "tir", bodyType: "tenteli", capacityTon: 25 } as const;
  const cap = returnCapacity({ origin: AYDIN, dest: IST, vehicle }, returnWindow("2026-10-09"));
  const load = { origin: { lat: 40.98, lng: 29.1 }, dest: NAZILLI, loadFrom: "2026-10-10", loadTo: "2026-10-11", weightTon: 18, vehicleType: "tir", bodyType: null } as const;
  it("varış noktasından eve giden yük aday", () => {
    expect(cap.origin).toBe(IST);
    expect(cap.dest).toBe(AYDIN);
    expect(matchLoadWithCapacity(load, cap, 0.5).candidate).toBe(true);
  });
  it("pencere dışı tarih, ağır yük ve kasa uyumsuzluğu sebebiyle reddedilir", () => {
    expect(fitRejectReason({ ...load, loadFrom: "2026-10-20", loadTo: "2026-10-20" }, cap)).toBe("tarih");
    expect(fitRejectReason({ ...load, weightTon: 30 }, cap)).toBe("kapasite");
    expect(fitRejectReason({ ...load, bodyType: "frigo" }, cap)).toBe("kasa_tipi");
    expect(fitRejectReason(load, cap)).toBeNull();
  });
});
