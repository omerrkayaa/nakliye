// FR-05 / A15: Profil → Belgelerim — araç ruhsatı dosya seçerek yüklenir, yönetici onaylayınca "Onaylı" ve rozet;
// büyük dosya gönderilmez; görüntüle imzalı bağlantıyı açar. Expo web derlemesinde (390 px; kamera düğmesi web'de yok).
import { expect, test, type Page } from "@playwright/test";
import { adminToken, api, apiUser, btn, collectErrors, noHorizontalOverflow, otpFor, phone, psql, shot, vis } from "./helpers";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("mobil-testi")]);

/** Arayüzden OTP girişi (rolü olan kullanıcı) */
async function uiLogin(page: Page, p: string) {
  await page.goto("/");
  await page.getByLabel("Cep telefonu").locator("visible=true").fill(`0${p.slice(3)}`);
  await vis(page, "SMS kodu gönder").click();
  const codeInput = page.getByLabel("SMS kodu").locator("visible=true");
  await expect(codeInput).toBeVisible(); // yeni kod gönderildi (günlükte API girişinin eski kodu da var)
  await codeInput.fill(await otpFor(p));
  await vis(page, "Giriş yap").click();
  await expect(page.getByRole("tab", { name: /Profil/ })).toBeVisible({ timeout: 20_000 });
}

/** Bir belge satırı (accessibilityLabel = belge türü) */
const row = (page: Page, label: string) => page.getByLabel(label, { exact: true }).locator("visible=true");

async function choose(page: Page, label: string, name: string, buffer: Buffer) {
  const chooser = page.waitForEvent("filechooser");
  await row(page, label).getByRole("button", { name: /Dosya seç|Yeniden yükle/ }).click();
  await (await chooser).setFiles({ name, mimeType: name.endsWith(".pdf") ? "application/pdf" : "image/png", buffer });
}

test("belgelerim: büyük dosya gönderilmez; ruhsat yüklenir → incelemede; onaylanınca Onaylı + rozet; görüntüle", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const me = phone(60);
  const token = await apiUser(me, ["carrier"]);
  const plate = `65 MB ${me.slice(-6, -2)}`;
  const v = await api<{ id: string }>("POST", "/vehicles", token, { plate, vehicleType: "kamyon", bodyType: "kapali", capacityTon: 10 });
  expect(v.status).toBe(201);
  psql(`delete from otp_codes where phone='${me}'`); // API girişinin 60 sn yeniden gönderme sınırı
  await uiLogin(page, me);

  await page.getByRole("tab", { name: /Profil/ }).click();
  await btn(page, "Belgelerim").click();
  await expect(vis(page, "Henüz doğrulanmadı")).toBeVisible({ timeout: 20_000 });
  await expect(vis(page, plate.replace(/\s/g, ""))).toBeVisible();
  await expect(row(page, "Araç ruhsatı")).toContainText("Yüklenmedi");
  await expect(row(page, "SRC belgesi")).toContainText("Yüklenmedi");
  await expect(page.getByRole("button", { name: "Fotoğraf çek" })).toHaveCount(0); // web'de kamera yok
  expect(await noHorizontalOverflow(page)).toBe(true);

  await choose(page, "Araç ruhsatı", "buyuk.png", Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]));
  await expect(row(page, "Araç ruhsatı")).toContainText("Dosya en çok 10 MB olabilir");
  expect(psql(`select count(*) from documents d join users u on u.id = d.owner_user_id where u.phone='${me}'`)).toBe("0");

  await choose(page, "Araç ruhsatı", "ruhsat.png", PNG);
  await expect(row(page, "Araç ruhsatı")).toContainText("İnceleniyor", { timeout: 20_000 });
  const docId = psql(`select d.id from documents d join users u on u.id = d.owner_user_id where u.phone='${me}' and d.type='ruhsat'`);
  expect(docId).toMatch(/^[0-9a-f-]{36}$/);
  await shot(page, "belgelerim");

  const admin = await adminToken(phone(61));
  expect((await api("POST", `/admin/documents/${docId}/review`, admin, { decision: "onay" })).status).toBe(200);
  await page.goBack(); // Belgelerim yığın ekranı: sekme çubuğu yok; dönüp yeniden açınca liste ve rozet tazelenir
  await btn(page, "Belgelerim").click();
  await expect(row(page, "Araç ruhsatı")).toContainText("Onaylı", { timeout: 20_000 });
  await expect(vis(page, "Doğrulanmış", true).first()).toBeVisible();

  const popup = page.waitForEvent("popup");
  await row(page, "Araç ruhsatı").getByRole("button", { name: "Görüntüle" }).click();
  const p = await popup;
  await p.waitForLoadState();
  expect(p.url()).toMatch(/\/api\/v1\/files\/documents\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png\?exp=\d+&sig=/);
  await p.close();
  expect(errors).toEqual([]);
});
