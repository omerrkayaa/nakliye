// Araç tanıma (src/components/vehicle-3d): rehberde araç/kasa seçimi açıklamayı değiştirir, WebGL yoksa resim kalır,
// ilan formundaki "Hangisi?" penceresinden seçim forma işlenir.
import { expect, test, type Page } from "@playwright/test";
import { apiUser, phone } from "./helpers";

const BASE = "http://localhost:3001";
test.use({ baseURL: BASE });

const explorer = (page: Page) => page.locator("[data-vehicle-explorer]");
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
};

test("rehber: three.js ilk yüklemede yok (görüntüleyici ekrana gelince ayrı parça olarak yüklenir)", async ({ request }) => {
  const html = await (await request.get("/rehber/arac-tipleri")).text();
  const initial = [...new Set(html.match(/\/_next\/static\/[^"']+\.js/g) ?? [])];
  expect(initial.length).toBeGreaterThan(0);
  for (const src of initial) expect(await (await request.get(src)).text(), src).not.toContain("WebGLRenderer");
});

test("rehber: araç ve kasa seçilince 3B görüntü ve açıklama değişir; yaygın olmayan eşleşmede not çıkar", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/rehber/arac-tipleri");
  const ex = explorer(page);
  await ex.scrollIntoViewIfNeeded();
  await expect(ex.locator("[data-vehicle-viewer]")).toHaveAttribute("data-vehicle-viewer", "hazir", { timeout: 20_000 });
  await expect(ex.getByRole("button", { name: "Tır", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(ex).toContainText("Tenteli: Brandayla örtülü");

  await ex.getByRole("button", { name: "Kırkayak", exact: true }).click();
  await ex.getByRole("button", { name: "Kayar perde", exact: true }).click();
  await expect(ex).toContainText("Kırkayak: Dört dingilli büyük kamyon");
  await expect(ex).toContainText("Kayar perde: Yan perdeleri kayarak açılır");
  await expect(ex).not.toContainText("yaygın değil");

  await ex.getByRole("button", { name: "Panelvan", exact: true }).click();
  await expect(ex.getByRole("button", { name: "Kapalı kasa", exact: true })).toHaveAttribute("aria-pressed", "true"); // kayar perde panelvanda yok → varsayılan
  await ex.getByRole("button", { name: "Damper", exact: true }).click();
  await expect(ex).toContainText("Panelvan için damper yaygın değil; görselde kapalı kasa gösteriliyor.");
  expect(errors).toEqual([]);
});

test("rehber: WebGL yoksa aynı modellerden çıkarılmış resim kalır", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return /webgl/.test(type) ? null : (orig as (...a: unknown[]) => unknown).call(this, type, ...args);
    } as typeof orig;
  });
  await page.goto("/rehber/arac-tipleri");
  const ex = explorer(page);
  await ex.scrollIntoViewIfNeeded();
  await expect(ex.locator("[data-vehicle-viewer]")).toHaveAttribute("data-vehicle-viewer", "yok", { timeout: 20_000 });
  const img = ex.locator("[data-vehicle-viewer] img");
  await expect(img).toHaveAttribute("src", "/arac/tir.png");
  await ex.getByRole("button", { name: "Frigo", exact: true }).click();
  await expect(img).toHaveAttribute("src", "/arac/kasa-frigo.png");
  expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
});

test("ilan formu: \"Hangisi?\" penceresinden araç ve kasa seçilir", async ({ browser }) => {
  const S = await apiUser(phone(990), "shipper", "Araç Seçen");
  const context = await browser.newContext({ baseURL: BASE });
  await context.addCookies([
    { name: "nk_at", value: S.accessToken, url: BASE, httpOnly: true },
    { name: "nk_rt", value: S.refreshToken, url: BASE, httpOnly: true },
  ]);
  const page = await context.newPage();
  await page.goto("/panel/ilanlar/yeni");
  await page.getByRole("button", { name: /^Hangisi\?/ }).click();
  const dialog = page.getByRole("dialog", { name: "Araç ve kasa tipleri" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Kırkayak", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Tenteli", exact: true })).toHaveAttribute("aria-pressed", "true"); // araç değişince kasa korunur
  await dialog.getByRole("button", { name: "Damper", exact: true }).click();
  await dialog.getByRole("button", { name: "Araç ve kasayı seç" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Araç tipi")).toHaveValue("kirkayak");
  await expect(page.getByLabel("Kasa tipi")).toHaveValue("damper");

  // Pencere seçili değerle açılır; "Yalnız araç tipini seç" kasayı "Farketmez" bırakır
  await page.getByRole("button", { name: /^Hangisi\?/ }).click();
  await expect(dialog.getByRole("button", { name: "Kırkayak", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Kamyonet", exact: true }).click();
  await dialog.getByRole("button", { name: "Yalnız araç tipini seç" }).click();
  await expect(page.getByLabel("Araç tipi")).toHaveValue("kamyonet");
  await expect(page.getByLabel("Kasa tipi")).toHaveValue("");
  await context.close();
});
