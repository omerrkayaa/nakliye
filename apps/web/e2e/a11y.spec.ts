// NFR-06 erişilebilirlik: WCAG 2.0/2.1/2.2 A ve AA kurallarıyla otomatik tarama (axe-core). Herkese açık sayfalar,
// giriş adımları, yük sahibi paneli ve yönetim bölümü; masaüstü ve telefon genişliği (telefonda yatay taşma da, NFR-03).
// Otomatik tarama WCAG'in yalnız bir kısmını yakalar (renk kontrastı, etiket, ad, rol, hedef boyutu…); klavye ve ekran
// okuyucu denemesi ayrıca gerekir.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminToken, api, apiLogin, apiUser, createLoad, localPhone, phone, psql, adminSession } from "./helpers";

// Seri değil: bir sayfa grubunda ihlal çıksa da diğerleri taransın (dosya içindeki testler yine sırayla çalışır)

const BASE = "http://localhost:3001";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface Finding {
  path: string;
  id: string;
  impact: string | null | undefined;
  help: string;
  count: number;
  targets: string[];
}

async function scan(page: Page, label: string): Promise<Finding[]> {
  await expect(page.getByText("Yükleniyor…")).toHaveCount(0);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return r.violations.map((v) => ({ path: label, id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
}
async function scanPaths(page: Page, paths: string[]) {
  const all: Finding[] = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const p of paths) {
      await page.goto(p);
      all.push(...(await scan(page, `${p} @${width}`)));
      // NFR-03 "mobilde de çalışır" (WCAG 1.4.10 yeniden akış): telefon genişliğinde yatay kaydırma olmamalı
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (width < 1000 && sw > width) all.push({ path: `${p} @${width}`, id: "yatay-tasma", impact: "serious", help: `Sayfa ${sw} px genişliğinde, yatay kayıyor`, count: 1, targets: [] });
    }
  }
  return all;
}
const report = (f: Finding[]) => f.map((x) => `${x.path}: [${x.impact}] ${x.id} (${x.count}) ${x.help} → ${x.targets.join(" | ")}`).join("\n");

async function asUser(browser: Browser, t: { accessToken: string; refreshToken: string }) {
  const ctx = await browser.newContext({ baseURL: BASE });
  await ctx.addCookies([
    { name: "nk_at", value: t.accessToken, url: BASE, httpOnly: true },
    { name: "nk_rt", value: t.refreshToken, url: BASE, httpOnly: true },
  ]);
  return ctx;
}

let admin: string;
let shareId: string;

test.beforeAll(async () => {
  admin = await adminToken(960);
  const S = await apiUser(phone(961), "shipper", "Erişilebilir Lojistik");
  const loadId = await createLoad(S.accessToken, admin);
  shareId = (await api<{ shareId: string }>("GET", `/loads/${loadId}`, S.accessToken)).body.shareId;
});

test("herkese açık sayfalar ve giriş adımları WCAG AA ihlali içermez", async ({ page }) => {
  const found = await scanPaths(page, ["/", "/giris", "/kvkk", "/kullanim-sartlari", "/iletisim", "/nakliye/izmir-ankara", `/ilan/${shareId}`]);
  // Giriş: kod adımı (hata mesajı görünürken)
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/giris");
  await page.getByLabel("Cep telefonu").fill(localPhone(phone(962)));
  await page.getByRole("button", { name: "SMS kodu gönder" }).click();
  await expect(page.getByLabel(/numarasına gelen kod/)).toBeVisible();
  await page.getByLabel(/numarasına gelen kod/).fill("000000");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.locator("#login-error")).toBeVisible();
  found.push(...(await scan(page, "/giris (kod adımı, hata)")));
  expect(found, report(found)).toEqual([]);
});

test("yük sahibi paneli WCAG AA ihlali içermez", async ({ browser }) => {
  const S = await apiUser(phone(963), "shipper", "Panel Erişim");
  await api("POST", "/companies", S.accessToken, { title: "Erişim Ticaret", taxNo: "1234567890", taxOffice: "Muğla" });
  await createLoad(S.accessToken, admin);
  const ctx = await asUser(browser, S);
  const page = await ctx.newPage();
  const found = await scanPaths(page, ["/panel", "/panel/ilanlar", "/panel/ilanlar/yeni", "/panel/tasimalar", "/panel/nakliyecilerim", "/panel/firma", "/panel/hesap", "/panel/bildirimler"]);
  await ctx.close();
  expect(found, report(found)).toEqual([]);
});

test("yönetim bölümü WCAG AA ihlali içermez", async ({ browser }) => {
  const p = phone(964);
  const t = await apiLogin(p);
  psql(`insert into user_roles(user_id, role) select id, 'admin' from users where phone='${p}' on conflict do nothing`);
  const a = await adminSession(t.accessToken);
  await api("PATCH", "/me", a.accessToken, { name: "Erişim Yönetici" });
  const ctx = await asUser(browser, a);
  const page = await ctx.newPage();
  const pages = ["moderasyon", "belgeler", "sikayetler", "itirazlar", "kullanicilar", "metrikler", "ayarlar", "kayitlar", "guvenlik"];
  const found = await scanPaths(page, pages.map((x) => `/panel/yonetim/${x}`));
  await ctx.close();
  expect(found, report(found)).toEqual([]);
});
