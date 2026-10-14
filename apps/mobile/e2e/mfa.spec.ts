// NFR-04: doğrulama uygulaması kurulu yönetici mobilde de SMS kodundan sonra uygulama kodunu girer (yanlış kod hata
// verir, doğru kodla giriş). Kurulum yalnız web'de (yönetim bölümü); burada API ile yapılır. Expo web derlemesinde (390 px).
import { expect, test } from "@playwright/test";
import { adminSession, collectErrors, otpFor, phone, psql, totp, vis } from "./helpers";

test("yönetici: SMS kodu → uygulama kodu (yanlış kod hatası) → giriş", async ({ page }) => {
  const errors = collectErrors(page);
  const p = phone(90);
  const { secret } = await adminSession(p);
  // Kurulumda kullanılan kod aynı 30 sn'de yeniden geçmez: "uygulamada yeni kod çıktı" gibi son adım geri alınır
  psql(`update user_totp set last_step = ${Math.floor(Date.now() / 30_000) - 2} where user_id=(select id from users where phone='${p}')`);

  await page.goto("/");
  await page.getByLabel("Cep telefonu").locator("visible=true").fill(`0${p.slice(3)}`);
  await vis(page, "SMS kodu gönder").click();
  const codeInput = page.getByLabel("SMS kodu").locator("visible=true");
  await expect(codeInput).toBeVisible(); // yeni kod gönderildi (günlükte API girişinin eski kodu da var)
  await codeInput.fill(await otpFor(p));
  await vis(page, "Giriş yap").click();

  const totpInput = page.getByLabel("Doğrulama uygulamasındaki kod").locator("visible=true");
  await expect(totpInput).toBeVisible();
  await totpInput.fill(totp(secret) === "999999" ? "999998" : "999999");
  await vis(page, "Doğrula", true).click();
  await expect(vis(page, "Kod hatalı")).toBeVisible();
  await totpInput.fill(totp(secret));
  await vis(page, "Doğrula", true).click();
  // Yalnız yönetici rolü var: rol seçimi (nakliyeci varsayılan) → sekmeler
  await vis(page, "Devam").click();
  await expect(page.getByRole("tab", { name: /Profil/ })).toBeVisible({ timeout: 20_000 });
  // Kasıtlı yanlış kodun 401 yanıtını tarayıcı konsola yazar; başka hata olmamalı
  expect(errors.filter((e) => !e.includes("status of 401"))).toEqual([]);
});
