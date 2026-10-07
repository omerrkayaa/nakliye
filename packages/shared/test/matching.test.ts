import { describe, expect, it } from "vitest";
import { matchLoadWithCapacity, type CapacityForMatch, type LoadForMatch } from "../src/rules/matching.js";

const NAZILLI = { lat: 37.913, lng: 28.321 };
const AYDIN = { lat: 37.845, lng: 27.845 };
const DENIZLI = { lat: 37.783, lng: 29.094 };
const HADIMKOY = { lat: 41.153, lng: 28.62 };
const TUZLA = { lat: 40.816, lng: 29.3 };
const ANKARA = { lat: 39.925, lng: 32.866 };

const load: LoadForMatch = {
  origin: NAZILLI,
  dest: HADIMKOY,
  loadFrom: "2026-10-09",
  loadTo: "2026-10-09",
  weightTon: 20,
  vehicleType: "tir",
  bodyType: "tenteli",
};

const cap: CapacityForMatch = {
  origin: AYDIN,
  dest: TUZLA,
  availableFrom: "2026-10-09",
  availableTo: "2026-10-10",
  vehicle: { type: "tir", bodyType: "tenteli", capacityTon: 24 },
};

describe("matchLoadWithCapacity (BR-20, BR-21)", () => {
  it("uygun araç ve yük adaydır, skor 0–1 arasıdır", () => {
    const r = matchLoadWithCapacity(load, cap, 0.8);
    expect(r.candidate).toBe(true);
    if (r.candidate) {
      expect(r.originKm).toBeGreaterThan(40);
      expect(r.originKm).toBeLessThan(50);
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("araç tipi farklıysa reddeder", () => {
    const r = matchLoadWithCapacity(load, { ...cap, vehicle: { ...cap.vehicle, type: "kamyon" } }, 1);
    expect(r).toEqual({ candidate: false, reason: "arac_tipi" });
  });

  it("kasa tipi farklıysa reddeder, yük kasa istemiyorsa kabul eder", () => {
    const frigo = { ...cap, vehicle: { ...cap.vehicle, bodyType: "frigo" as const } };
    expect(matchLoadWithCapacity(load, frigo, 1)).toEqual({ candidate: false, reason: "kasa_tipi" });
    expect(matchLoadWithCapacity({ ...load, bodyType: null }, frigo, 1).candidate).toBe(true);
  });

  it("kapasite yetmezse reddeder", () => {
    expect(matchLoadWithCapacity({ ...load, weightTon: 25 }, cap, 1)).toEqual({ candidate: false, reason: "kapasite" });
  });

  it("tarihler ±1 gün toleransla kesişmiyorsa reddeder", () => {
    const later = { ...cap, availableFrom: "2026-10-10", availableTo: "2026-10-12" };
    expect(matchLoadWithCapacity(load, later, 1).candidate).toBe(true); // 1 gün tolerans
    const muchLater = { ...cap, availableFrom: "2026-10-11", availableTo: "2026-10-12" };
    expect(matchLoadWithCapacity(load, muchLater, 1)).toEqual({ candidate: false, reason: "tarih" });
  });

  it("kalkış 50 km'den uzaksa reddeder", () => {
    expect(matchLoadWithCapacity(load, { ...cap, origin: DENIZLI }, 1)).toEqual({ candidate: false, reason: "kalkis_uzak" });
  });

  it("varış 80 km'den uzaksa reddeder, 'her yer' diyen aracı kabul eder", () => {
    expect(matchLoadWithCapacity(load, { ...cap, dest: ANKARA }, 1)).toEqual({ candidate: false, reason: "varis_uzak" });
    const anywhere = matchLoadWithCapacity(load, { ...cap, dest: null }, 1);
    expect(anywhere.candidate).toBe(true);
  });

  it("güven skoru yüksek olan daha üstte sıralanır", () => {
    const low = matchLoadWithCapacity(load, cap, 0.1);
    const high = matchLoadWithCapacity(load, cap, 0.9);
    if (!low.candidate || !high.candidate) throw new Error("aday olmalı");
    expect(high.score).toBeGreaterThan(low.score);
  });
});
