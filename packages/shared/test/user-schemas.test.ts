import { describe, expect, it } from "vitest";
import { addRolesSchema, createCompanySchema, isValidTckn, updateCompanySchema, updateMeSchema } from "../src/schemas.js";

describe("isValidTckn", () => {
  it("kontrol haneleri tutan numarayı kabul eder", () => {
    expect(isValidTckn("10000000146")).toBe(true);
  });

  it("kontrol hanesi bozuk, 0 ile başlayan ya da kısa numarayı reddeder", () => {
    expect(isValidTckn("10000000147")).toBe(false);
    expect(isValidTckn("10000000156")).toBe(false);
    expect(isValidTckn("00000000146")).toBe(false);
    expect(isValidTckn("1000000014")).toBe(false);
  });
});

describe("createCompanySchema (FR-03)", () => {
  it("bireysel devam için sadece unvan yeterli", () => {
    expect(createCompanySchema.safeParse({ title: "Kaya Lojistik" }).success).toBe(true);
  });

  it("10 haneli VKN ve geçerli TCKN'yi kabul eder, boşlukları temizler", () => {
    expect(createCompanySchema.parse({ title: "Kaya Ltd", taxNo: "123 456 7890" }).taxNo).toBe("1234567890");
    expect(createCompanySchema.safeParse({ title: "Kaya", taxNo: "10000000146" }).success).toBe(true);
  });

  it("geçersiz vergi no ve çok kısa unvanı reddeder", () => {
    expect(createCompanySchema.safeParse({ title: "Kaya", taxNo: "12345" }).success).toBe(false);
    expect(createCompanySchema.safeParse({ title: "Kaya", taxNo: "10000000147" }).success).toBe(false);
    expect(createCompanySchema.safeParse({ title: " K " }).success).toBe(false);
  });
});

describe("updateCompanySchema", () => {
  it("isteğe bağlı alanı null ile silmeye izin verir", () => {
    expect(updateCompanySchema.parse({ taxNo: null })).toEqual({ taxNo: null });
  });

  it("boş güncellemeyi reddeder", () => {
    expect(updateCompanySchema.safeParse({}).success).toBe(false);
  });
});

describe("kullanıcı şemaları", () => {
  it("adı kırpar ve uzunluğu denetler", () => {
    expect(updateMeSchema.parse({ name: "  Ömer Kaya  " }).name).toBe("Ömer Kaya");
    expect(updateMeSchema.safeParse({ name: "Ö" }).success).toBe(false);
  });

  it("bozuk kodlamayla gelen metni reddeder", () => {
    expect(updateMeSchema.safeParse({ name: "�mer Kaya" }).success).toBe(false);
  });

  it("kullanıcı kendine yönetici rolü veremez", () => {
    expect(addRolesSchema.safeParse({ roles: ["carrier", "shipper"] }).success).toBe(true);
    expect(addRolesSchema.safeParse({ roles: ["admin"] }).success).toBe(false);
    expect(addRolesSchema.safeParse({ roles: [] }).success).toBe(false);
  });
});
