import { expect, test } from "@playwright/test";
import { collectErrors, demoLogin, seedDemo, vis } from "./helpers";

// FR-21 Yakınımdakiler: konum yalnız çipe dokununca bir kez alınır; 50 km içindeki yükler, kartta kalkışa uzaklık.
// Konum Nazilli ilçe merkezi (demo ilanı Nazilli → Esenyurt orada kalkıyor).
const NAZILLI = { latitude: 37.913, longitude: 28.32 };

test.beforeAll(() => seedDemo());

test("yakınımdakiler: izin verilince 50 km içindeki yükler mesafeyle; kapatınca normal akış", async ({ browser }) => {
  const ctx = await browser.newContext({ geolocation: NAZILLI, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await demoLogin(page);
  await expect(vis(page, /^Teyitli ·/).first()).toBeVisible();
  await expect(vis(page, /^Kalkış \d+ km uzakta$/)).toHaveCount(0);

  const req = page.waitForRequest((r) => r.url().includes("/loads?") && r.url().includes("near="));
  await page.getByRole("button", { name: "Yakınımdakiler" }).locator("visible=true").click();
  expect(new URL((await req).url()).searchParams.get("near")).toBe("37.9130,28.3200");
  await expect(vis(page, /^Bulunduğunuz yere 50 km içindeki yükler/)).toBeVisible();
  const chip = page.getByRole("button", { name: "Yakınımdakiler" }).locator("visible=true");
  await expect(page.getByRole("button", { name: /Nazilli, Aydın → Esenyurt/ }).locator("visible=true").first()).toBeVisible();
  const distances = (await vis(page, /^Kalkış \d+ km uzakta$/).allInnerTexts()).map((t) => Number(/\d+/.exec(t)![0]));
  expect(distances.length).toBeGreaterThan(0);
  for (const d of distances) expect(d).toBeLessThanOrEqual(50);
  // Teyitliler önde, kendi içinde yakından uzağa (API sırası)
  expect(distances.slice(0, 3)).toEqual([...distances.slice(0, 3)].sort((a, b) => a - b));

  // Çipe yeniden dokununca konum araması kapanır
  await chip.click();
  await expect(vis(page, /^Bulunduğunuz yere 50 km/)).toHaveCount(0);
  await expect(vis(page, /^Kalkış \d+ km uzakta$/)).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("yakınımdakiler: konum izni verilmezse açıklama, liste değişmez", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await demoLogin(page);
  await expect(vis(page, /^Teyitli ·/).first()).toBeVisible();
  await page.getByRole("button", { name: "Yakınımdakiler" }).locator("visible=true").click();
  await expect(vis(page, /^Konum (izni verilmedi|alınamadı)/)).toBeVisible();
  await expect(vis(page, /^Kalkış \d+ km uzakta$/)).toHaveCount(0);
  await ctx.close();
});
