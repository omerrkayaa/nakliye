import { describe, expect, it } from "vitest";
import { isQualifiedReporter, maskPhone } from "../src/rules/contact.js";
import { shouldForceReconfirm } from "../src/rules/confirmation.js";

describe("maskPhone (BR-40)", () => {
  it("numaranın ortasını gizler", () => {
    expect(maskPhone("+905321234567")).toBe("0532 *** ** 67");
  });
});

describe("BR-05 şikayetçi", () => {
  it("doğrulanmış ya da ilanı aramış kullanıcı sayılır", () => {
    expect(isQualifiedReporter({ verificationLevel: 1, calledThisLoad: false })).toBe(true);
    expect(isQualifiedReporter({ verificationLevel: 0, calledThisLoad: true })).toBe(true);
  });

  it("doğrulanmamış ve aramamış kullanıcı sayılmaz", () => {
    expect(isQualifiedReporter({ verificationLevel: 0, calledThisLoad: false })).toBe(false);
  });

  it("2 farklı sayılan şikayetçide anında teyit istenir", () => {
    expect(shouldForceReconfirm(1)).toBe(false);
    expect(shouldForceReconfirm(2)).toBe(true);
  });
});
