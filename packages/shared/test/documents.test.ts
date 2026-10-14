import { describe, expect, it } from "vitest";
import { detectDocumentType, verificationLevel, type VerificationInput } from "../src/rules/documents.js";

const base: VerificationInput = { roles: [], approved: [], activeVehicleIds: [], companyVerified: false, completedShipperJobs: 0, today: "2026-10-13" };
const doc = (type: VerificationInput["approved"][number]["type"], vehicleId: string | null = null, expiresAt: string | null = null) => ({ type, vehicleId, expiresAt });

describe("detectDocumentType", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it("PDF, JPEG ve PNG'yi ilk baytlardan tanır", () => {
    expect(detectDocumentType(new TextEncoder().encode("%PDF-1.7\n"))).toBe("application/pdf");
    expect(detectDocumentType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe("image/jpeg");
    expect(detectDocumentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
  });
  it("başka türü ve kısa dosyayı reddeder (uzantı ya da beyan edilen tür önemsiz)", () => {
    expect(detectDocumentType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(detectDocumentType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(detectDocumentType(bytes(0x89, 0x50, 0x4e))).toBeNull();
    expect(detectDocumentType(new Uint8Array())).toBeNull();
  });
});

describe("BR-10 doğrulama seviyesi", () => {
  const carrier = { ...base, roles: ["carrier"] as const, activeVehicleIds: ["v1"] };
  it("nakliyeci: belge yok 0, etkin aracın ruhsatı 1, + K belgesi + SRC 2", () => {
    expect(verificationLevel(carrier)).toBe(0);
    expect(verificationLevel({ ...carrier, approved: [doc("ruhsat", "v1")] })).toBe(1);
    expect(verificationLevel({ ...carrier, approved: [doc("ruhsat", "v1"), doc("k_belgesi")] })).toBe(1);
    expect(verificationLevel({ ...carrier, approved: [doc("ruhsat", "v1"), doc("k_belgesi"), doc("src")] })).toBe(2);
  });
  it("ruhsatsız K belgesi + SRC seviye vermez; silinen aracın ruhsatı sayılmaz", () => {
    expect(verificationLevel({ ...carrier, approved: [doc("k_belgesi"), doc("src")] })).toBe(0);
    expect(verificationLevel({ ...carrier, approved: [doc("ruhsat", "v2"), doc("k_belgesi"), doc("src")] })).toBe(0);
  });
  it("süresi geçen belge sayılmaz; bitiş günü hâlâ geçerli", () => {
    expect(verificationLevel({ ...carrier, approved: [doc("ruhsat", "v1", "2026-10-12")] })).toBe(0);
    expect(verificationLevel({ ...carrier, approved: [doc("ruhsat", "v1", "2026-10-13")] })).toBe(1);
    expect(verificationLevel({ ...carrier, approved: [doc("ruhsat", "v1"), doc("k_belgesi"), doc("src", null, "2026-01-01")] })).toBe(1);
  });
  it("yük sahibi: vergi levhası onayı 1, + 3 tamamlanmış iş 2; onaysız iş seviye vermez", () => {
    const shipper = { ...base, roles: ["shipper"] as const };
    expect(verificationLevel({ ...shipper, completedShipperJobs: 5 })).toBe(0);
    expect(verificationLevel({ ...shipper, companyVerified: true, completedShipperJobs: 2 })).toBe(1);
    expect(verificationLevel({ ...shipper, companyVerified: true, completedShipperJobs: 3 })).toBe(2);
  });
  it("rolü olmayan belge seviye vermez; iki rolde en yükseği", () => {
    expect(verificationLevel({ ...base, activeVehicleIds: ["v1"], approved: [doc("ruhsat", "v1")], companyVerified: true })).toBe(0);
    const both = { ...base, roles: ["carrier", "shipper"] as const, activeVehicleIds: ["v1"], approved: [doc("ruhsat", "v1")], companyVerified: true, completedShipperJobs: 3 };
    expect(verificationLevel(both)).toBe(2);
    expect(verificationLevel({ ...both, companyVerified: false })).toBe(1);
  });
});
