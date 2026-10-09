// Herkese açık site: W1 tanıtım ve W4 yasal sayfalar (girişsiz).
import { expect, test } from "@playwright/test";

test.use({ baseURL: "http://localhost:3001" });

test("tanıtım sayfası: değer önerisi, panele giriş, nasıl çalışır ve rozetler", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gördüğün her yük gerçek ve şu an geçerli.");
  await expect(page.getByRole("link", { name: "Yük sahibiyim, panele gir" })).toHaveAttribute("href", "/panel");
  await expect(page.getByText("Nakliyeci uygulaması (Android) yakında")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nasıl çalışır" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kartlardaki işaretler ne anlama geliyor?" })).toBeVisible();
  // Girişsiz panel → giriş sayfası
  await page.getByRole("link", { name: "Yük sahibiyim, panele gir" }).click();
  await expect(page).toHaveURL(/\/giris\?sonra=%2Fpanel$/);
  await expect(page.getByRole("link", { name: "kullanım şartlarını" })).toHaveAttribute("href", "/kullanim-sartlari");
  await expect(page.getByRole("link", { name: "KVKK aydınlatma metnini" })).toHaveAttribute("href", "/kvkk");
});

test("yasal sayfalar: alt bilgiden açılır, taslak uyarısı var", async ({ page }) => {
  await page.goto("/");
  for (const [link, heading] of [
    ["KVKK aydınlatma metni", "Kişisel verilerin işlenmesine ilişkin aydınlatma metni"],
    ["Kullanım şartları", "Kullanım şartları"],
    ["İletişim", "İletişim"],
  ]) {
    await page.getByRole("contentinfo").getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByRole("note")).toContainText("Bu metin taslaktır");
  }
});

test("telefon genişliğinde (390 px) herkese açık sayfalar yatay taşmaz", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/kvkk", "/kullanim-sartlari", "/iletisim", "/giris"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
    if (process.env.SHOTS && path === "/") await page.screenshot({ path: `${process.env.SHOTS}/tanitim-390.png`, fullPage: true });
  }
  if (process.env.SHOTS) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.screenshot({ path: `${process.env.SHOTS}/tanitim.png`, fullPage: true });
  }
});
