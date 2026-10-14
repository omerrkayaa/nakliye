// NFR-04 yönetici iki adımlı doğrulaması (web): kurulumsuz yönetici yönetim bölümünde kurulumu görür → QR + anahtar →
// uygulama kodu → kurtarma kodları; giriş SMS + uygulama kodu (yanlış kod, kurtarma kodu); Güvenlik sekmesi: kurtarma
// kodu yenileme ve telefon değiştirme. TOTP kodu testte RFC 6238 ile üretilir (helpers.totp).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { apiLogin, localPhone, otpFor, phone, psql, totp } from "./helpers";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3001";
const P = phone(950);
let secret = "";
let recovery: string[] = [];

/** "Uygulamada yeni kod çıktı": aynı 30 sn'de ikinci kod tekrar korumasına takılmasın diye kullanılan son adım geri alınır */
const freshCode = (s: string) => {
  psql(`update user_totp set last_step = ${Math.floor(Date.now() / 30_000) - 2} where user_id=(select id from users where phone='${P}')`);
  return totp(s);
};

async function smsLogin(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  psql(`delete from otp_codes where phone='${P}'`); // 60 sn yeniden gönderme sınırı
  await page.goto("/giris");
  await page.getByLabel("Cep telefonu").fill(localPhone(P));
  await page.getByRole("button", { name: "SMS kodu gönder" }).click();
  const codeInput = page.getByLabel(/numarasına gelen kod/);
  await expect(codeInput).toBeVisible(); // yeni kod gönderildi (günlükte önceki girişin kodu da var)
  await codeInput.fill(await otpFor(P));
  await page.getByRole("button", { name: "Giriş yap" }).click();
  return page;
}

test("kurulumsuz yönetici: yönetim bölümü kurulumu ister; QR + anahtar → kod → kurtarma kodları → bölüm açılır", async ({ browser }) => {
  const t = await apiLogin(P);
  psql(`insert into user_roles(user_id, role) select id, 'admin' from users where phone='${P}' on conflict do nothing`);
  const ctx = await browser.newContext({ baseURL: BASE });
  await ctx.addCookies([
    { name: "nk_at", value: t.accessToken, url: BASE, httpOnly: true },
    { name: "nk_rt", value: t.refreshToken, url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  await page.goto("/panel/yonetim/belgeler");
  await expect(page.getByRole("heading", { name: "İki adımlı doğrulamayı kurun" })).toBeVisible();
  await page.getByRole("button", { name: "Kurulumu başlat" }).click();
  await expect(page.getByRole("img", { name: "Doğrulama uygulaması için QR kodu" })).toBeVisible();
  secret = (await page.getByTestId("totp-secret").innerText()).replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  // QR, uygulamanın okuyacağı PNG
  expect(await page.getByRole("img", { name: "Doğrulama uygulaması için QR kodu" }).getAttribute("src")).toMatch(/^data:image\/png;base64,/);

  const codeField = page.getByLabel("Uygulamadaki 6 haneli kod");
  await codeField.fill(totp(secret) === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Etkinleştir" }).click();
  await expect(page.getByText("Kod hatalı")).toBeVisible();
  await codeField.fill(totp(secret));
  await page.getByRole("button", { name: "Etkinleştir" }).click();

  const list = page.getByTestId("recovery-codes").getByRole("listitem");
  await expect(list).toHaveCount(10);
  recovery = await list.allInnerTexts();
  const next = page.getByRole("button", { name: "Devam" });
  await expect(next).toBeDisabled();
  await page.getByLabel("Kodları güvenli bir yere kaydettim").check();
  await next.click();
  await expect(page.getByRole("navigation", { name: "Belge durumu" })).toBeVisible(); // istenen yönetim sayfası açıldı
  await expect(page.getByRole("heading", { name: "İki adımlı doğrulamayı kurun" })).toHaveCount(0);
  await page.getByRole("link", { name: "Güvenlik" }).click();
  await expect(page.getByTestId("totp-status")).toContainText("Açık");
  await expect(page.getByTestId("recovery-left")).toContainText("10 / 10");
  await ctx.close();
});

test("giriş: SMS kodundan sonra uygulama kodu; yanlış kod hata verir; doğru kodla yönetim açılır", async ({ browser }) => {
  const page = await smsLogin(browser);
  const totpField = page.getByLabel("Doğrulama uygulamasındaki kod");
  await expect(totpField).toBeVisible();
  await expect(page).toHaveURL(/\/giris/); // SMS kodu tek başına oturum açmadı
  await totpField.fill(totp(secret) === "999999" ? "999998" : "999999");
  await page.getByRole("button", { name: "Doğrula" }).click();
  await expect(page.locator("#login-error")).toHaveText("Kod hatalı");
  await totpField.fill(freshCode(secret));
  await page.getByRole("button", { name: "Doğrula" }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await page.goto("/panel/yonetim/guvenlik");
  await expect(page.getByTestId("totp-status")).toContainText("Açık");
  await page.context().close();
});

test("kurtarma koduyla giriş; kalan kod azalır; yeni kurtarma kodları üretilir", async ({ browser }) => {
  const page = await smsLogin(browser);
  await page.getByLabel("Doğrulama uygulamasındaki kod").fill(recovery[0]!.toLowerCase());
  await page.getByRole("button", { name: "Doğrula" }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await page.goto("/panel/yonetim/guvenlik");
  await expect(page.getByTestId("recovery-left")).toContainText("9 / 10");

  await page.getByLabel("Uygulamadaki kod (ya da bir kurtarma kodu)", { exact: true }).fill(freshCode(secret));
  await page.getByRole("button", { name: "Yeni kurtarma kodları üret" }).click();
  const list = page.getByTestId("recovery-codes").getByRole("listitem");
  await expect(list).toHaveCount(10);
  const fresh = await list.allInnerTexts();
  expect(fresh.some((c) => recovery.includes(c))).toBe(false);
  recovery = fresh;
  await page.reload();
  await expect(page.getByTestId("recovery-left")).toContainText("10 / 10");
  await page.context().close();
});

test("telefon değiştirme: mevcut kodla yeni QR → yeni uygulamanın kodu → eski anahtar geçersiz", async ({ browser }) => {
  const page = await smsLogin(browser);
  await page.getByLabel("Doğrulama uygulamasındaki kod").fill(freshCode(secret));
  await page.getByRole("button", { name: "Doğrula" }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await page.goto("/panel/yonetim/guvenlik");
  await page.getByRole("button", { name: "Yeni telefonu kur" }).click();
  await expect(page.getByText("Cihaz değiştirmek için mevcut uygulamadaki kodu ya da bir kurtarma kodunu girin.")).toBeVisible();
  await page.getByLabel("Mevcut uygulamadaki kod (ya da bir kurtarma kodu)").fill(freshCode(secret));
  await page.getByRole("button", { name: "Yeni telefonu kur" }).click();
  await expect(page.getByRole("img", { name: "Doğrulama uygulaması için QR kodu" })).toBeVisible();
  const secret2 = (await page.getByTestId("totp-secret").innerText()).replace(/\s/g, "");
  expect(secret2).not.toBe(secret);
  await page.getByLabel("Uygulamadaki 6 haneli kod").fill(totp(secret2));
  await page.getByRole("button", { name: "Etkinleştir" }).click();
  await expect(page.getByTestId("recovery-codes").getByRole("listitem")).toHaveCount(10);
  await page.getByLabel("Kodları güvenli bir yere kaydettim").check();
  await page.getByRole("button", { name: "Devam" }).click();
  await expect(page).toHaveURL(/\/panel\/yonetim\/moderasyon$/);
  await page.context().close();

  const again = await smsLogin(browser);
  await again.getByLabel("Doğrulama uygulamasındaki kod").fill(freshCode(secret));
  await again.getByRole("button", { name: "Doğrula" }).click();
  await expect(again.locator("#login-error")).toHaveText("Kod hatalı");
  await again.getByLabel("Doğrulama uygulamasındaki kod").fill(freshCode(secret2));
  await again.getByRole("button", { name: "Doğrula" }).click();
  await expect(again).toHaveURL(/\/panel$/);
  await again.context().close();
});
