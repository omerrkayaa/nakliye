// Araç tanıma resimlerini 3B modellerden çıkarır: 5 araç (en sık kasasıyla) + tır üstünde 7 kasa = 12 şeffaf PNG.
// Web'de WebGL yoksa yedek, mobilde seçim görseli olarak kullanılır. Geliştirme sunucusu açıkken (npm run dev):
//   node scripts/render-vehicles.mjs public/arac ../mobile/assets/vehicles
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp"; // Next.js'in bağımlılığı; palet PNG ile resimler ~3 kat küçülür

const outs = process.argv.slice(2);
if (!outs.length) throw new Error("Çıktı klasörü verin");
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const VEHICLES = { tir: "Tır", kirkayak: "Kırkayak", kamyon: "Kamyon", kamyonet: "Kamyonet", panelvan: "Panelvan" };
const DEFAULT = { tir: "Tenteli", kirkayak: "Damper", kamyon: "Açık kasa", kamyonet: "Açık kasa", panelvan: "Kapalı kasa" };
const BODIES = { tenteli: "Tenteli", acik: "Açık kasa", kapali: "Kapalı kasa", frigo: "Frigo", damper: "Damper", kayar_perde: "Kayar perde", lowbed: "Lowbed" };

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 2 });
await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
await page.goto(`${BASE}/rehber/arac-tipleri`, { timeout: 120_000 });
const ex = page.locator("[data-vehicle-explorer]");
await ex.scrollIntoViewIfNeeded();
await page.locator('[data-vehicle-viewer="hazir"]').waitFor({ timeout: 60_000 });

/** Kırpılmış resimlerin boyutu (mobil, oranı bundan alır: Image.resolveAssetSource web'de yok) */
const sizes = {};
const shot = async (vehicle, body, file) => {
  await ex.getByRole("button", { name: VEHICLES[vehicle], exact: true }).click();
  await ex.getByRole("button", { name: body, exact: true }).click();
  await page.waitForTimeout(400);
  // Şeffaf kenarlar kırpılır (araç + gölge + 8 px pay): mobilde resim boşluksuz otursun
  const { url, w, h } = await ex.locator("canvas").evaluate((c) => {
    const t = document.createElement("canvas");
    [t.width, t.height] = [c.width, c.height];
    const g = t.getContext("2d");
    g.drawImage(c, 0, 0);
    const { data } = g.getImageData(0, 0, t.width, t.height);
    let [x0, y0, x1, y1] = [t.width, t.height, 0, 0];
    for (let y = 0; y < t.height; y++)
      for (let x = 0; x < t.width; x++)
        if (data[(y * t.width + x) * 4 + 3] > 8) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    const pad = 8;
    [x0, y0] = [Math.max(0, x0 - pad), Math.max(0, y0 - pad)];
    [x1, y1] = [Math.min(t.width - 1, x1 + pad), Math.min(t.height - 1, y1 + pad)];
    const o = document.createElement("canvas");
    [o.width, o.height] = [x1 - x0 + 1, y1 - y0 + 1];
    o.getContext("2d").drawImage(t, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return { url: o.toDataURL("image/png"), w: o.width, h: o.height };
  });
  const png = await sharp(Buffer.from(url.split(",")[1], "base64")).png({ palette: true, quality: 90, effort: 10 }).toBuffer();
  for (const dir of outs) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), png);
  }
  sizes[file] = [w, h];
  console.log(file, Math.round(png.length / 1024), "KB");
};
for (const v of Object.keys(VEHICLES)) await shot(v, DEFAULT[v], `${v}.png`);
for (const [b, label] of Object.entries(BODIES)) await shot("tir", label, `kasa-${b}.png`);
for (const dir of outs) writeFileSync(join(dir, "sizes.json"), `${JSON.stringify(sizes, null, 2)}
`);
await browser.close();
