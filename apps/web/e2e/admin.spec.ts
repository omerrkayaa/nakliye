// Yönetici paneli: ilan moderasyonu (Y4), şikayet kuyruğu (Y3), kullanıcı arama ve askıya alma (Y2).
// Hazırlık API ile; tarayıcı yöneticidir. Yönetici olmayan kullanıcı bölümü göremez.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { api, apiLogin, apiUser, localPhone, phone, psql } from "./helpers";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3001";
const SP = phone(201);
let context: BrowserContext;
let page: Page;
let S: Awaited<ReturnType<typeof apiUser>>;
let C1: Awaited<ReturnType<typeof apiUser>>;
let L1: string, L2: string;
const dialogs: string[] = [];

const trDay = (offset: number) => new Date(Date.now() + 3 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
const fmt = (p: string) => localPhone(p).replace(/^(\d{4})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4");

async function rawLoad(token: string, weightTon: number) {
  const locs = (await api<{ name: string; districts: { id: number; name: string }[] }[]>("GET", "/locations")).body;
  const d = (prov: string, name: string) => locs.find((p) => p.name === prov)!.districts.find((x) => x.name === name)!.id;
  const r = await api("POST", "/loads", token, {
    originDistrictId: d("Muğla", "Menteşe"),
    destDistrictId: d("Antalya", "Muratpaşa"),
    loadFrom: trDay(1),
    loadTo: trDay(2),
    cargoType: "palet",
    weightTon,
    vehicleType: "kamyon",
    bodyType: null,
    priceType: "teklif",
    price: null,
  });
  return r.body;
}

async function cookieContext(browser: import("@playwright/test").Browser, t: { accessToken: string; refreshToken: string }) {
  const ctx = await browser.newContext({ baseURL: BASE });
  await ctx.addCookies([
    { name: "nk_at", value: t.accessToken, url: BASE, httpOnly: true },
    { name: "nk_rt", value: t.refreshToken, url: BASE, httpOnly: true },
  ]);
  return ctx;
}

test.beforeAll(async ({ browser }) => {
  const ap = phone(902);
  const a = await apiLogin(ap);
  psql(`insert into user_roles(user_id, role) select id, 'admin' from users where phone='${ap}' on conflict do nothing`);
  const admin = (await api<{ accessToken: string; refreshToken: string }>("POST", "/auth/refresh", undefined, { refreshToken: a.refreshToken })).body;
  await api("PATCH", "/me", admin.accessToken, { name: "Test Yönetici" });

  S = await apiUser(SP, "shipper", "Moderasyon Deneme");
  C1 = await apiUser(phone(202), "carrier", "Şikayetçi Nakliyat");
  const l1 = await rawLoad(S.accessToken, 6);
  const l2 = await rawLoad(S.accessToken, 9);
  // Yeni hesabın ilk ilanları moderasyona düşer (BR-11)
  expect([l1.status, l2.status]).toEqual(["moderasyonda", "moderasyonda"]);
  L1 = l1.id!;
  L2 = l2.id!;

  context = await cookieContext(browser, admin);
  page = await context.newPage();
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
});

test.afterAll(async () => {
  psql(`update load_posts set status='iptal' where id in ('${L1}','${L2}') and status in ('teyitli','teyit_bekliyor','moderasyonda')`);
  await context.close();
});

test("yönetici olmayan bölümü göremez, menüde bağlantı yok", async ({ browser }) => {
  const ctx = await cookieContext(browser, S);
  const p = await ctx.newPage();
  await p.goto("/panel/yonetim/sikayetler");
  await expect(p.getByText("Bu bölüm yalnız yöneticiler içindir.")).toBeVisible();
  await expect(p.getByRole("link", { name: "Yönetim" })).toHaveCount(0);
  await ctx.close();
});

test("telefon genişliğinde yönetici sayfaları yatay taşmaz (menüde Yönetim varken)", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/panel/yonetim/moderasyon", "/panel/yonetim/sikayetler", "/panel/yonetim/kullanicilar"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Yönetim" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Çıkış" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
});

test("moderasyon: onayla → yayında; reddet → onay sorulur, iptal", async () => {
  await page.goto("/panel");
  await page.getByRole("link", { name: "Yönetim" }).click();
  await expect(page).toHaveURL(/\/panel\/yonetim\/moderasyon$/);
  const row1 = page.locator(`li[data-load-id="${L1}"]`);
  const row2 = page.locator(`li[data-load-id="${L2}"]`);
  await expect(row1).toContainText("Menteşe, Muğla → Muratpaşa, Antalya");
  await expect(row1).toContainText("Moderasyon Deneme");
  await expect(row1.getByRole("link", { name: fmt(SP) })).toBeVisible();

  await row1.getByRole("button", { name: "Onayla" }).click();
  await expect(row1).toHaveCount(0);
  expect((await api("GET", `/loads/${L1}`, S.accessToken)).body.status).toBe("teyitli");

  await row2.getByRole("button", { name: "Reddet" }).click();
  await expect(row2).toHaveCount(0);
  expect(dialogs.at(-1)).toContain("İlan reddedilsin mi?");
  expect((await api("GET", `/loads/${L2}`, S.accessToken)).body.status).toBe("iptal");
});

test("şikayet: kuyrukta hedef ve sahibi görünür; haklı kararı notla sonuçlanır", async () => {
  await api("POST", `/loads/${L1}/call`, C1.accessToken);
  const rep = await api("POST", "/reports", C1.accessToken, { targetType: "load_post", targetId: L1, reason: "sahte", note: "Firma böyle bir yük vermediğini söyledi" });
  expect(rep.status).toBe(201);
  const id = rep.body.id!;

  // Açık kuyruk eskiden yeniye: önceki çalıştırmaların açık şikayetleri öndeyse son sayfaya kadar git
  const row = page.locator(`li[data-report-id="${id}"]`);
  for (let n = 1; n <= 100; n++) {
    await page.goto(`/panel/yonetim/sikayetler?sayfa=${n}`);
    await expect(page.locator("li[data-report-id]").first()).toBeVisible();
    if ((await row.count()) > 0 || (await page.getByRole("link", { name: "Sonraki" }).count()) === 0) break;
  }
  await expect(row).toContainText("Sahte ilan");
  await expect(row).toContainText("“Firma böyle bir yük vermediğini söyledi”");
  await expect(row).toContainText("İlan: Menteşe, Muğla → Muratpaşa, Antalya · Teyitli");
  await expect(row).toContainText(`İlan sahibi: Moderasyon Deneme · ${fmt(SP)}`);
  await expect(row).toContainText("Bildiren: Şikayetçi Nakliyat");

  await row.getByLabel("Karar notu (isteğe bağlı)").fill("Firma aranarak doğrulandı");
  await row.getByRole("button", { name: "Haklı" }).click();
  await expect(row).toHaveCount(0);

  await page.goto("/panel/yonetim/sikayetler?durum=kapali");
  const done = page.locator(`li[data-report-id="${id}"]`);
  await expect(done).toContainText("Haklı bulundu — Firma aranarak doğrulandı");
  // Haklı şikayet güven skoruna girdi (BR-30): yeni yük sahibinde 0,25'ten düşer
  expect(Number(psql(`select trust_score from users where phone='${SP}'`))).toBeLessThan(0.25);
});

test("kullanıcılar: numarayla ara → askıya al (sebep zorunlu) → askıdakilerde → askıyı kaldır", async () => {
  await page.goto("/panel/yonetim/kullanicilar");
  await page.getByRole("searchbox").or(page.getByLabel("Numara ya da ad")).fill(fmt(SP));
  await page.getByRole("button", { name: "Ara" }).click();
  const row = page.locator(`li[data-user-id="${S.id}"]`);
  await expect(row).toContainText("Moderasyon Deneme");
  await expect(row).toContainText("Aktif");

  await row.getByRole("button", { name: "Askıya al" }).click();
  await row.getByLabel("Askıya alma sebebi").fill("Kısa");
  await row.getByRole("button", { name: "Askıya al" }).click();
  await expect(row.getByText("Sebebi en az 5 karakterle yazın")).toBeVisible();
  await expect(row.getByLabel("Askıya alma sebebi")).toHaveValue("Kısa"); // yazılan korunur
  await row.getByLabel("Askıya alma sebebi").fill("Haklı bulunan sahte ilan şikayeti");
  await row.getByRole("button", { name: "Askıya al" }).click();
  await expect(row).toContainText("Askıda");
  await expect(row).toContainText("Sebep: Haklı bulunan sahte ilan şikayeti");
  expect(dialogs.at(-1)).toContain("askıya alınsın mı?");

  // API: oturum yenilenemez, yayındaki ilan iptal
  expect((await api("POST", "/auth/refresh", undefined, { refreshToken: S.refreshToken })).status).toBe(401);
  expect(psql(`select status from load_posts where id='${L1}'`)).toBe("iptal");

  await page.goto("/panel/yonetim/kullanicilar");
  await expect(page.getByRole("heading", { name: "Askıdaki hesaplar" })).toBeVisible();
  const listed = page.locator(`li[data-user-id="${S.id}"]`);
  await expect(listed).toBeVisible();
  await listed.getByRole("button", { name: "Askıyı kaldır" }).click();
  await expect(listed).toHaveCount(0);
  expect(dialogs.at(-1)).toContain("Kapanan ilanlar geri açılmaz");
  expect(psql(`select status from users where phone='${SP}'`)).toBe("aktif");
});
