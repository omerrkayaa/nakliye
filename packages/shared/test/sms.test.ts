import { describe, expect, it } from "vitest";
import { confirmationSmsText, SINGLE_SMS_LENGTH, toGsm7 } from "../src/sms.js";

// GSM 03.38 temel alfabesinin bu mesajlarda kullanılabilecek alt kümesi
const GSM7_SAFE = /^[A-Za-z0-9 .,:;?!/>_\-]+$/;

describe("toGsm7", () => {
  it("Türkçe harfleri ASCII'ye çevirir", () => {
    expect(toGsm7("Çağlayancerit, Şanlıurfa, İğdır, Gümüşhane, Hakkâri")).toBe("Caglayancerit, Sanliurfa, Igdir, Gumushane, Hakkari");
  });
});

describe("confirmationSmsText (F1)", () => {
  const token = "AbCdEfGhIjKlMn-_"; // 16 karakter base64url

  it("en uzun il/ilçe adlarıyla bile tek SMS'e sığar ve GSM-7 dışı karakter içermez", () => {
    const text = confirmationSmsText(
      { province: "Kahramanmaraş", district: "Çağlayancerit" },
      { province: "Afyonkarahisar", district: "Sultandağı" },
      `https://nakliye.app/t/${token}`,
    );
    expect(text.length).toBeLessThanOrEqual(SINGLE_SMS_LENGTH);
    expect(text).toMatch(GSM7_SAFE);
    expect(text).toContain("Kahramanmaras/Caglayancerit > Afyonkarahisar/Sultandagi");
  });

  it("uzun bir alan adında ilçeleri atıp yine tek SMS'te kalır", () => {
    const text = confirmationSmsText(
      { province: "Kahramanmaraş", district: "Çağlayancerit" },
      { province: "Afyonkarahisar", district: "Sultandağı" },
      `https://www.nakliye-platformu-ornek-alan-adi.com.tr/teyit/${token}`,
    );
    expect(text.length).toBeLessThanOrEqual(SINGLE_SMS_LENGTH);
    expect(text).toContain("Kahramanmaras > Afyonkarahisar");
  });
});
