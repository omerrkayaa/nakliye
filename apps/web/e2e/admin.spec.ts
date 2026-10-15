// Yönetici paneli: ilan moderasyonu (Y4), şikayet kuyruğu (Y3), kullanıcı arama ve askıya alma (Y2), itirazlar.
// Hazırlık API ile; tarayıcı yöneticidir. Yönetici olmayan kullanıcı bölümü göremez.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { adminSession, api, apiLogin, apiUser, localPhone, phone, psql } from "./helpers";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3001";
const SP = phone(201);
let context: BrowserContext;
let page: Page;
let S: Awaited<ReturnType<typeof apiUser>>;
let C1: Awaited<ReturnType<typeof apiUser>>;
let L1: string, L2: string, adminAccess: string;
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
  const admin = await adminSession(a.accessToken); // NFR-04: yönetici rolü ikinci adımla
  await api("PATCH", "/me", admin.accessToken, { name: "Test Yönetici" });
  adminAccess = admin.accessToken;

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
  const pages = ["moderasyon", "belgeler", "sikayetler", "itirazlar", "kullanicilar", "metrikler", "ayarlar", "kayitlar", "guvenlik"];
  for (const path of pages.map((p) => `/panel/yonetim/${p}`)) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Yönetim" })).toBeVisible();
    await expect(page.getByText("Yükleniyor…")).toHaveCount(0); // içerik geldikten sonra ölç (ayar formları geniş)
    await expect(page.getByRole("button", { name: "Çıkış" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
});

/** Moderasyon kuyruğu eskiden yeniye ve 20'lik sayfalı: başka takımların bekleyen ilanları öndeyse ilan sonraki sayfadadır */
async function queuePageOf(id: string) {
  for (let n = 1; n <= 50; n++) {
    const r = await api<{ items: { id: string }[]; hasMore: boolean }>("GET", `/admin/loads?page=${n}`, adminAccess);
    if (r.body.items.some((l) => l.id === id)) return n;
    if (!r.body.hasMore) break;
  }
  throw new Error(`İlan kuyrukta yok: ${id}`);
}

test("moderasyon: onayla → yayında; reddet → onay sorulur, iptal", async () => {
  await page.goto("/panel");
  await page.getByRole("link", { name: "Yönetim" }).click();
  await expect(page).toHaveURL(/\/panel\/yonetim\/moderasyon$/);
  const p1 = await queuePageOf(L1);
  if (p1 > 1) await page.goto(`/panel/yonetim/moderasyon?sayfa=${p1}`);
  const row1 = page.locator(`li[data-load-id="${L1}"]`);
  const row2 = page.locator(`li[data-load-id="${L2}"]`);
  await expect(row1).toContainText("Menteşe, Muğla → Muratpaşa, Antalya");
  await expect(row1).toContainText("Moderasyon Deneme");
  await expect(row1.getByRole("link", { name: fmt(SP) })).toBeVisible();

  await row1.getByRole("button", { name: "Onayla" }).click();
  await expect(row1).toHaveCount(0);
  expect((await api("GET", `/loads/${L1}`, S.accessToken)).body.status).toBe("teyitli");
  const p2 = await queuePageOf(L2);
  if (p2 !== p1) await page.goto(`/panel/yonetim/moderasyon?sayfa=${p2}`);

  await row2.getByRole("button", { name: "Reddet" }).click();
  await expect(row2).toHaveCount(0);
  expect(dialogs.at(-1)).toContain("İlan reddedilsin mi?");
  expect((await api("GET", `/loads/${L2}`, S.accessToken)).body.status).toBe("iptal");
});

test("ayarlar (FR-54): fiyat katsayısı kaydedilir, önizleme değişir; hatalı ağırlık alan hatası verir; varsayılana dönülür", async () => {
  try {
    await page.goto("/panel/yonetim");
    // İçerik akarken tıklanan sekme geçişi kaybolabiliyor (documents.spec'teki not): önce sayfa gelsin
    await expect(page.getByRole("heading", { name: "Onay bekleyen ilanlar" })).toBeVisible();
    await page.getByRole("link", { name: "Ayarlar" }).click();
    await expect(page).toHaveURL(/\/panel\/yonetim\/ayarlar$/);
    const price = page.locator('[data-setting="price"]');
    await expect(page.getByTestId("setting-status-price")).toHaveText("Varsayılan değerler kullanılıyor.");
    const tirRow = () => page.getByTestId("price-preview").locator("li").first();
    const tirBefore = (await tirRow().textContent()) ?? "";
    await price.getByLabel("Motorin fiyatı (₺/L)").fill("120");
    await price.getByRole("button", { name: "Kaydet" }).click();
    await expect(price.getByRole("status")).toHaveText("Kaydedildi.");
    await expect(page.getByTestId("setting-status-price")).toContainText("Son değişiklik: Test Yönetici");
    await expect(tirRow()).not.toHaveText(tirBefore);
    await expect(price.getByLabel("Motorin fiyatı (₺/L)")).toHaveValue("120");
    // Formdaki diğer değerler (ör. "3000", "1,15") geri okunurken bozulmamalı: kayıttaki fark yalnız motorin
    expect(psql(`select note from admin_audit_log where action='ayar_degisikligi' order by created_at desc limit 1`)).toBe("Fiyat aralığı: Motorin fiyatı (₺/L): 60 → 120");
    await expect(price.getByLabel("Şoför (₺/gün)").first()).toHaveValue("3000");

    const matching = page.locator('[data-setting="matching"]');
    await matching.getByLabel("Ağırlık: güven skoru").fill("0,9");
    await matching.getByRole("button", { name: "Kaydet" }).click();
    await expect(matching.getByRole("alert")).toHaveText("Ağırlıkların toplamı 1 olmalı");
    await expect(page.getByTestId("setting-status-matching")).toHaveText("Varsayılan değerler kullanılıyor.");

    await price.getByRole("button", { name: "Varsayılana döndür" }).click(); // onay diyaloğu beforeAll'da kabul ediliyor
    await expect(page.getByTestId("setting-status-price")).toHaveText("Varsayılan değerler kullanılıyor.");
    await expect(tirRow()).toHaveText(tirBefore);
    expect(dialogs.at(-1)).toContain("varsayılana dönsün mü?");
  } finally {
    // Ayarlar küresel: başka testlere sızmasın
    for (const k of ["price", "matching", "confirmation"]) await api("POST", `/admin/settings/${k}/reset`, adminAccess);
  }
});

test("işlem kaydı (NFR-05): moderasyon kararları yöneticinin adıyla, etkilenen kişi ve zamanla", async () => {
  await page.getByRole("link", { name: "İşlem kaydı" }).click();
  await expect(page).toHaveURL(/\/panel\/yonetim\/kayitlar$/);
  const list = page.getByTestId("audit-list");
  // Başka takımların işlemleri araya girebilir: satırı ilanın kısa kimliğiyle bul
  const rejected = list.locator("li").filter({ hasText: L2.slice(0, 8) });
  await expect(rejected).toContainText("Test Yönetici");
  await expect(rejected).toContainText("İlanı reddetti");
  await expect(rejected).toContainText("Etkilenen: Moderasyon Deneme");
  await expect(list.locator("li").filter({ hasText: L1.slice(0, 8) })).toContainText("İlanı onayladı");
  expect(await rejected.locator("time").getAttribute("datetime")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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

test("itiraz: kuyrukta iki taraf ve sebep; gerekçe zorunlu; 'teslim geçersiz' iptal eder, yük sahibi kararı görür", async ({ browser }) => {
  // Hazırlık API ile: ilan → teklif → kabul → teslim → itiraz
  const S2 = await apiUser(phone(203), "shipper", "İtiraz Eden Gıda");
  const C2 = await apiUser(phone(204), "carrier", "Hasar Nakliyat");
  const v = (await api("POST", "/vehicles", C2.accessToken, { plate: `48 IT ${SP.slice(-7, -3)}`, vehicleType: "kamyon", bodyType: "tenteli", capacityTon: 10 })).body.id!;
  const l = await rawLoad(S2.accessToken, 5);
  if (l.status === "moderasyonda") await api("POST", `/admin/loads/${l.id}/review`, adminAccess, { decision: "onay" });
  const o = (await api("POST", `/loads/${l.id}/offers`, C2.accessToken, { vehicleId: v, price: 6000 })).body.id!;
  const acc = (await api<{ job: { id: string }; deliveryCode: string }>("POST", `/offers/${o}/accept`, S2.accessToken)).body;
  await api("POST", `/jobs/${acc.job.id}/deliver`, C2.accessToken, { code: acc.deliveryCode });
  expect((await api("POST", `/jobs/${acc.job.id}/dispute`, S2.accessToken, { reason: "Paletlerden biri kırık geldi" })).status).toBe(200);

  // /panel/yonetim akış içinde moderasyona yönlendirir: yönlendirme bitmeden tıklanırsa sonradan geri götürür
  await page.goto("/panel/yonetim/moderasyon");
  await expect(page.getByRole("heading", { name: "Onay bekleyen ilanlar" })).toBeVisible();
  await page.getByRole("link", { name: "İtirazlar" }).click();
  await expect(page).toHaveURL(/\/panel\/yonetim\/itirazlar$/);
  // Açık kuyruk eskiden yeniye: önceki çalıştırmaların itirazları öndeyse sayfa sayfa git
  const row = page.locator(`li[data-dispute-id="${acc.job.id}"]`);
  for (let n = 1; n <= 100; n++) {
    if (n > 1) await page.goto(`/panel/yonetim/itirazlar?sayfa=${n}`);
    await expect(page.locator("li[data-dispute-id]").first()).toBeVisible();
    if ((await row.count()) > 0 || (await page.getByRole("link", { name: "Sonraki" }).count()) === 0) break;
  }
  await expect(row).toContainText("Menteşe, Muğla → Muratpaşa, Antalya");
  await expect(row).toContainText("Yük sahibinin itirazı: “Paletlerden biri kırık geldi”");
  await expect(row).toContainText(`Yük sahibi: İtiraz Eden Gıda · ${fmt(phone(203))}`);
  await expect(row.getByRole("link", { name: fmt(phone(204)) })).toHaveAttribute("href", `tel:${phone(204)}`);

  // Kısa gerekçe: API hatası alanda
  await row.getByLabel("Karar gerekçesi (iki tarafa gönderilir)").fill("kısa");
  await row.getByRole("button", { name: "Teslim geçersiz: iptal et" }).click();
  await expect(row.getByText("Kararın gerekçesini en az 5 karakterle yazın")).toBeVisible();
  expect(psql(`select status from jobs where id='${acc.job.id}'`)).toBe("itirazli");

  await row.getByLabel("Karar gerekçesi (iki tarafa gönderilir)").fill("Alıcı kırık paleti fotoğrafla belgeledi");
  await row.getByRole("button", { name: "Teslim geçersiz: iptal et" }).click();
  await expect(row).toHaveCount(0);
  expect(dialogs.at(-1)).toContain("nakliyecinin iptal oranına yazılır");
  expect(psql(`select status from jobs where id='${acc.job.id}'`)).toBe("iptal");

  await page.goto("/panel/yonetim/itirazlar?durum=kapali");
  await expect(page.locator(`li[data-dispute-id="${acc.job.id}"]`)).toContainText("Teslim geçersiz: taşıma iptal edildi — Alıcı kırık paleti fotoğrafla belgeledi");

  // Yük sahibi taşıma sayfasında kararı ve yeniden yayınlamayı görür
  const ctx = await cookieContext(browser, S2);
  const p = await ctx.newPage();
  await p.goto(`/panel/tasimalar/${acc.job.id}`);
  await expect(p.getByText("Taşıma iptal edildi: “Yönetici kararı: Alıcı kırık paleti fotoğrafla belgeledi”")).toBeVisible();
  await expect(p.getByRole("listitem").filter({ hasText: "Taşıma iptal edildi" })).toContainText("yönetici");
  await expect(p.getByRole("link", { name: "İlanı yeniden yayınla" })).toBeVisible();
  await ctx.close();
});

test("metrikler: bu hafta kapanan yük API ile aynı; haftalık ve günlük grafik + tablo", async () => {
  const m = (await api<{ weeklyClosed: { week: string; closed: number }[]; dailyLoads: unknown[] }>("GET", "/admin/metrics", adminAccess)).body;
  await page.goto("/panel/yonetim/metrikler");
  await expect(page.getByTestId("closed-this-week")).toHaveText(String(m.weeklyClosed.at(-1)!.closed));
  const weekly = page.getByRole("region", { name: "Haftalık kapanan yük" });
  await expect(weekly.getByRole("listitem")).toHaveCount(8);
  await expect(page.getByRole("region", { name: "Günlük yeni ilan" }).getByRole("listitem")).toHaveCount(14);
  // Değer tabloda da var (ipucu tek yol değil)
  await weekly.getByText("Tablo olarak göster").click();
  await expect(weekly.locator("tbody tr")).toHaveCount(8);
  await expect(weekly.locator("tbody tr").last()).toContainText(`${m.weeklyClosed.at(-1)!.closed} taşıma`);
  // Sütun odaklanınca ipucu görünür
  await weekly.getByRole("listitem").last().focus();
  await expect(weekly.getByRole("tooltip").last()).toBeVisible();
  // NFR-09 API sağlığı: hata oranı kutuları ve bildirim okunma oranı; rota tablosu başlıklarıyla
  const health = page.getByTestId("api-health");
  await expect(health).toContainText("API hata oranı (5xx, 24 saat)");
  await expect(health).toContainText("API hata oranı (5xx, 7 gün)");
  await expect(health).toContainText("Bildirim okunma oranı");
  await expect(page.getByRole("table").filter({ hasText: "hata veren ve en yavaş rotalar" }).getByRole("columnheader", { name: "p95" })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/metrikler.png`, fullPage: true });
});
