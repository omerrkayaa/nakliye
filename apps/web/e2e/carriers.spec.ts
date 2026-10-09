// P7 Nakliyecilerim (favoriler) ve P8 Firma profili. Hazırlık API ile; tarayıcı yük sahibidir.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { adminToken, api, apiUser, createLoad, phone, psql } from "./helpers";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3001";
let context: BrowserContext;
let page: Page;
let admin: string;
let S: Awaited<ReturnType<typeof apiUser>>;
let C: Awaited<ReturnType<typeof apiUser>>;

test.beforeAll(async ({ browser }) => {
  admin = await adminToken(905);
  S = await apiUser(phone(601), "shipper", "Favori Deneme");
  C = await apiUser(phone(602), "carrier", "Sadık Nakliyat");
  // Birlikte bir iş (tamamlandı)
  const v = (await api("POST", "/vehicles", C.accessToken, { plate: `48 FV ${phone(601).slice(-7, -3)}`, vehicleType: "kamyon", bodyType: "tenteli", capacityTon: 10 })).body.id!;
  const l = await createLoad(S.accessToken, admin);
  const o = (await api("POST", `/loads/${l}/offers`, C.accessToken, { vehicleId: v, price: 9000 })).body.id!;
  const acc = (await api<{ job: { id: string }; deliveryCode: string }>("POST", `/offers/${o}/accept`, S.accessToken)).body;
  await api("POST", `/jobs/${acc.job.id}/deliver`, C.accessToken, { code: acc.deliveryCode });
  await api("POST", `/jobs/${acc.job.id}/complete`, S.accessToken);
  context = await browser.newContext({ baseURL: BASE });
  await context.addCookies([
    { name: "nk_at", value: S.accessToken, url: BASE, httpOnly: true },
    { name: "nk_rt", value: S.refreshToken, url: BASE, httpOnly: true },
  ]);
  page = await context.newPage();
});

test.afterAll(async () => {
  psql(`update load_posts set status='iptal' where status in ('teyitli','teyit_bekliyor','moderasyonda') and shipper_id='${S.id}'`);
  await context.close();
});

test("Nakliyecilerim: birlikte iş yapılan nakliyeci, tam numara; favoriye ekle → yeni ilan ona bildirilir", async () => {
  await page.goto("/panel");
  await page.getByRole("link", { name: "Nakliyecilerim" }).click();
  const row = page.locator(`li[data-carrier-id="${C.id}"]`);
  await expect(row).toContainText("Sadık Nakliyat");
  await expect(row).toContainText("Sizinle 1 taşıma (1 tamamlandı)");
  await expect(row.getByRole("link", { name: `0${phone(602).slice(3)}`.replace(/^(\d{4})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4") })).toHaveAttribute("href", `tel:${phone(602)}`);
  const fav = row.getByRole("button", { name: "Sadık Nakliyat: favori" });
  await expect(fav).toHaveAttribute("aria-pressed", "false");
  await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", "true");
  await expect(fav).toContainText("Favori");
  expect(psql(`select count(*) from favorite_carriers where shipper_id='${S.id}' and carrier_id='${C.id}'`)).toBe("1");

  const l = await createLoad(S.accessToken, admin);
  await expect
    .poll(async () => (await api<{ items: { type: string; data: { loadId?: string } }[] }>("GET", "/notifications", C.accessToken)).body.items.some((n) => n.type === "favorite_load" && n.data.loadId === l))
    .toBe(true);

  await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", "false");
  expect(psql(`select count(*) from favorite_carriers where shipper_id='${S.id}'`)).toBe("0");
});

test("Firma profili: firma oluştur, vergi no hatası alanda, düzelt; başlıkta unvan", async () => {
  await page.getByRole("link", { name: "Firma", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Firma profili" })).toBeVisible();
  await expect(page.getByLabel("Ad soyad")).toHaveValue("Favori Deneme");
  await page.getByLabel("Firma unvanı").fill("Favori Gıda Ltd. Şti.");
  await page.getByLabel(/Vergi no/).fill("12345");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "İşaretli alanları düzeltin" })).toBeVisible();
  await expect(page.getByLabel(/Vergi no/)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Firma unvanı")).toHaveValue("Favori Gıda Ltd. Şti."); // yazılan korunur
  expect(psql(`select count(*) from companies where owner_user_id='${S.id}'`)).toBe("0");

  await page.getByLabel(/Vergi no/).fill("");
  await page.getByLabel(/Vergi dairesi/).fill("Konak");
  await page.getByLabel(/Adres/).fill("Alsancak Mah. 1453 Sok. No: 5, İzmir");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kaydedildi." })).toBeVisible();
  expect(psql(`select title || '|' || tax_office || '|' || coalesce(tax_no, '-') from companies where owner_user_id='${S.id}'`)).toBe("Favori Gıda Ltd. Şti.|Konak|-");
  await expect(page.getByText("Firma henüz doğrulanmadı.")).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "Favori Gıda Ltd. Şti." })).toBeVisible();

  // Güncelleme: isteğe bağlı alan boşaltılınca silinir
  await page.reload();
  await page.getByLabel(/Vergi dairesi/).fill("");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kaydedildi." })).toBeVisible();
  expect(psql(`select coalesce(tax_office, 'yok') from companies where owner_user_id='${S.id}'`)).toBe("yok");
});

test("telefon genişliğinde (390 px) yeni sayfalar yatay taşmaz", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/panel/nakliyecilerim", "/panel/firma"]) {
    await page.goto(path);
    await page.locator("main h1").first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
});
