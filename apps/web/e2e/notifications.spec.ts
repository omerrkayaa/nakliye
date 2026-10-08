// Bildirim kutusu (A14'ün web karşılığı): zil + okunmamış sayısı, bildirimden ilgili sayfaya, teyit sorusuna
// bildirimden cevap (F1/BR-05), tümünü okundu say. Nakliyeci tarafı API ile.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { adminToken, api, apiUser, createLoad, phone } from "./helpers";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3001";
let context: BrowserContext;
let page: Page;
let S: Awaited<ReturnType<typeof apiUser>>;
let L: string;

test.beforeAll(async ({ browser }) => {
  const admin = await adminToken(903);
  S = await apiUser(phone(301), "shipper", "Bildirim Deneme");
  L = await createLoad(S.accessToken, admin);
  context = await browser.newContext({ baseURL: BASE });
  await context.addCookies([
    { name: "nk_at", value: S.accessToken, url: BASE, httpOnly: true },
    { name: "nk_rt", value: S.refreshToken, url: BASE, httpOnly: true },
  ]);
  page = await context.newPage();
  page.on("dialog", (d) => void d.accept());
});

test.afterAll(async () => {
  await context.close();
});

test("teklif gelince zilde sayı; bildirim teklif bölümüne götürür ve okundu olur", async () => {
  await page.goto("/panel/ilanlar");
  await expect(page.getByRole("link", { name: "Bildirimler", exact: true })).toBeVisible();

  const C = await apiUser(phone(302), "carrier", "Zil Nakliyat");
  const v = (await api("POST", "/vehicles", C.accessToken, { plate: `48 ZL ${phone(302).slice(-7, -3)}`, vehicleType: "kamyon", bodyType: "tenteli", capacityTon: 10 })).body.id;
  expect((await api("POST", `/loads/${L}/offers`, C.accessToken, { vehicleId: v, price: 8000 })).status).toBe(201);

  await page.reload();
  await page.getByRole("link", { name: /^Bildirimler, \d+ okunmamış$/ }).click();
  await expect(page).toHaveURL(/\/panel\/bildirimler$/);
  const item = page.getByRole("button", { name: "Okunmamış: Yeni teklif: 8.000 ₺" });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/panel/ilanlar/${L}#teklifler$`));
  await expect(page.getByText("Zil Nakliyat")).toBeVisible();

  await page.goto("/panel/bildirimler");
  await expect(page.getByRole("button", { name: "Yeni teklif: 8.000 ₺" })).toBeVisible(); // artık okundu
});

test("teyit sorusu (BR-05) bildirimden cevaplanır", async () => {
  for (const n of [303, 304]) {
    const c = await apiUser(phone(n), "carrier");
    expect((await api("POST", `/loads/${L}/call`, c.accessToken)).status).toBe(200);
    expect((await api("POST", "/reports", c.accessToken, { targetType: "load_post", targetId: L, reason: "yuk_yok" })).status).toBe(201);
  }
  await page.goto("/panel/bildirimler");
  const li = page.locator("li", { has: page.getByText("Yükünüzün gittiği bildirildi") });
  await li.getByRole("button", { name: "Evet, geçerli" }).click();
  await expect(li.getByRole("status")).toHaveText("✓ İlan teyit edildi");
  expect((await api("GET", `/loads/${L}`, S.accessToken)).body.status).toBe("teyitli");
});

test("tümünü okundu say: sayı sıfırlanır", async () => {
  const C = await apiUser(phone(305), "carrier");
  const v = (await api("POST", "/vehicles", C.accessToken, { plate: `48 OK ${phone(305).slice(-7, -3)}`, vehicleType: "kamyon", bodyType: "tenteli", capacityTon: 10 })).body.id;
  expect((await api("POST", `/loads/${L}/offers`, C.accessToken, { vehicleId: v, price: 7600 })).status).toBe(201);
  await page.goto("/panel/bildirimler");
  await expect(page.getByText(/^\d+ okunmamış$/)).toBeVisible();
  await page.getByRole("button", { name: "Tümünü okundu say" }).click();
  await expect(page.getByText("Hepsi okundu")).toBeVisible();
  await expect(page.getByRole("link", { name: "Bildirimler", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
