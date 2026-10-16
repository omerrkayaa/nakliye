// Tanıtım sayfasının 3B haritası (src/components/hero-map): ilk yüklemeyi ağırlaştırmaz, hata vermez, hareket azaltma tercihine
// uyar, WebGL yoksa SVG harita kalır, yola tıklayınca güzergâh sayfası açılır, telefon genişliğinde taşmaz.
import { expect, test, type Page } from "@playwright/test";

test.use({ baseURL: "http://localhost:3001" });

const map = (page: Page) => page.locator("[data-hero-map]");
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
};

test("3B sahne sayfa açıldıktan sonra yüklenir; three.js ilk yüklemede yok, hata yok", async ({ page, request }) => {
  // İlk HTML'in bağladığı betiklerde three.js (WebGLRenderer) bulunmamalı: ayrı parça, sonradan yüklenir
  const html = await (await request.get("/")).text();
  const initial = [...new Set(html.match(/\/_next\/static\/[^"']+\.js/g) ?? [])];
  expect(initial.length).toBeGreaterThan(0);
  for (const src of initial) expect(await (await request.get(src)).text(), src).not.toContain("WebGLRenderer");

  const errors = errorsOf(page);
  const lazy: string[] = [];
  page.on("response", async (r) => {
    if (r.url().endsWith(".js") && !initial.some((s) => r.url().endsWith(s)) && (await r.text().catch(() => "")).includes("WebGLRenderer")) lazy.push(r.url());
  });
  await page.goto("/");
  // Sunucuda çizilen SVG harita hemen var; 3B hazır olunca tuval görünür
  await expect(page.locator("figure svg path").first()).toBeAttached();
  await expect(map(page)).toHaveAttribute("data-hero-map", "hazir", { timeout: 20_000 });
  await expect(map(page)).toHaveAttribute("data-motion", "tam");
  await expect.poll(() => lazy.length).toBeGreaterThan(0);
  await expect(page.getByText("İğneler canlı ilan teyidini anlatan temsilî bir canlandırmadır")).toBeVisible();
  await expect(page.getByText("© OpenStreetMap katkıcıları")).toBeVisible();
  expect(errors).toEqual([]);
});

test("hareketi azalt tercihinde tek kare; yola tıklayınca güzergâh sayfası açılır", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(map(page)).toHaveAttribute("data-hero-map", "hazir", { timeout: 20_000 });
  await expect(map(page)).toHaveAttribute("data-motion", "azaltilmis");
  // İlk güzergâh İzmir → Ankara; orta noktasının üstüne gelince bilgi kutusu, tıklayınca sayfası
  const [x, y] = (await map(page).getAttribute("data-route-hint"))!.split(",").map(Number);
  const box = (await map(page).boundingBox())!;
  await page.mouse.move(box.x + x!, box.y + y!);
  await expect(page.getByText(/^İzmir → Ankara · \d+ km karayolu/)).toBeVisible();
  await page.mouse.click(box.x + x!, box.y + y!);
  await expect(page).toHaveURL(/\/nakliye\/izmir-ankara$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("İzmir");
});

test("WebGL yoksa SVG harita kalır, sayfa hata vermez", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return /webgl/.test(type) ? null : (orig as (...a: unknown[]) => unknown).call(this, type, ...args);
    } as typeof orig;
  });
  const errors = errorsOf(page);
  await page.goto("/");
  await expect(map(page)).toHaveAttribute("data-hero-map", "yok", { timeout: 20_000 });
  await expect(page.locator("figure svg path").first()).toBeVisible();
  // three.js bağlam kurulamayınca konsola kendi hatasını yazar; başka hata olmamalı
  expect(errors.filter((e) => !/WebGL/i.test(e))).toEqual([]);
});

test("telefon genişliğinde (390 px) harita sığar, sayfa yatay taşmaz", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(map(page)).toHaveAttribute("data-hero-map", "hazir", { timeout: 20_000 });
  const box = (await map(page).boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390 - 32);
  expect(box.width / box.height).toBeCloseTo(2, 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
