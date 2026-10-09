import { expect, test } from "@playwright/test";
import {
  acceptDialogs,
  adminToken,
  api,
  apiLoad,
  apiUser,
  btn,
  collectErrors,
  demoLogin,
  demoToken,
  districtId,
  noHorizontalOverflow,
  phone,
  pickDistrict,
  psql,
  seedDemo,
  shot,
  vis,
} from "./helpers";

// Nakliyeci (demo hesabı): yük akışı, teklif, araç, boş araç, rota alarmı, bildirimler, çevrimdışı.
// Demo verisi başta tazelenir (önceki çalıştırmanın teklifi ilana "bekleyen teklif" bırakır).
// Rota alarmı Hopa → Kars bölgesini kullanır (API alarm testinin bölgesi): demo alarmları başta silinir, ilan sonda iptal edilir.
// Demo bildirimleri başta silinir: önceki çalıştırmaların eşleşme bildirimleri saatlik sınırı (BR-22) doldurup alarm bildirimini engeller.

let demo: string;
test.beforeAll(async () => {
  seedDemo();
  demo = await demoToken();
  for (const a of (await api<{ items: { id: string }[] }>("GET", "/alerts", demo)).body.items) await api("DELETE", `/alerts/${a.id}`, demo);
  psql(`update capacity_posts set status='iptal' where status='aktif' and carrier_id=(select id from users where phone='+905550102030')`);
  psql(`delete from notifications where user_id=(select id from users where phone='+905550102030')`);
});

test("yük akışı → filtre → detay → teklif → Tekliflerim", async ({ page }) => {
  const errors = collectErrors(page);
  await demoLogin(page);
  await expect(vis(page, /^Teyitli ·/).first()).toBeVisible();

  await btn(page, "Nereden: Her yer").click();
  await page.getByLabel("Nereden ara").fill("ayd");
  await btn(page, "Aydın", true).click();
  await expect(vis(page, /, Aydın$/).first()).toBeVisible();

  // A6 güven sinyali: kartta ve detayda yük sahibinin puanı / tamamlanan işi
  await expect(vis(page, /^· (Yeni üye|★ \d,?\d? \(\d+\) · \d+ iş|\d+ iş · henüz puan yok)$/).first()).toBeVisible();
  await btn(page, /Nazilli, Aydın → Esenyurt/).first().click();
  await expect(vis(page, "Yük sahibi", true)).toBeVisible();
  await expect(vis(page, /^(Yeni üye|★ \d,?\d? \(\d+\) · \d+ iş|\d+ iş · henüz puan yok)$/).first()).toBeVisible();

  // F8 paylaş: sistemin paylaşım menüsü (web derlemesinde navigator.share) → metindeki bağlantı web'de aynı ilanı açar
  await page.evaluate(() => {
    (navigator as Navigator & { share: unknown }).share = async (d: ShareData) => {
      (window as unknown as { __shared: ShareData }).__shared = d;
    };
  });
  await vis(page, "Paylaş", true).click();
  const shared = await page.evaluate(() => (window as unknown as { __shared?: ShareData }).__shared?.text ?? "");
  expect(shared).toContain("*Nazilli, Aydın → Esenyurt, İstanbul*");
  expect(shared).not.toMatch(/\+90|\*\*\*/);
  const link = /http:\/\/localhost:3001\/ilan\/[A-Za-z0-9_-]{10}/.exec(shared)?.[0];
  expect(link, shared).toBeTruthy();
  const web = await page.context().newPage();
  await web.goto(link!);
  await expect(web.getByRole("heading", { level: 1 })).toHaveText("Nazilli, Aydın → Esenyurt, İstanbul");
  await web.close();
  // F7: teklif verirken tahmini piyasa aralığı
  await expect(vis(page, /^Tahmini piyasa aralığı: [\d.]+ ₺ – [\d.]+ ₺ \(yaklaşık \d+ km; otoyol\/köprü hariç\)$/)).toBeVisible();
  const price = page.getByLabel("Fiyat (₺, KDV hariç)").locator("visible=true");
  await expect(price).toHaveValue("24000");
  await price.fill("23500");
  await vis(page, "Teklifi gönder").click();
  await expect(vis(page, "Teklifiniz iletildi")).toBeVisible();
  await vis(page, "Tekliflerime git").click();
  await expect(vis(page, "Teklifim: 23.500 ₺").first()).toBeVisible();

  await page.getByRole("tab", { name: /Profil/ }).click();
  await expect(vis(page, /09DM0102/).first()).toBeVisible();
  await page.reload();
  await expect(vis(page, "Demo hesabıyla gir")).toHaveCount(0);
  expect(await noHorizontalOverflow(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("araç ekle ve sil, boş araç bildir → uygun yükler → doldu", async ({ page }) => {
  const errors = collectErrors(page);
  const dialogs = acceptDialogs(page);
  await demoLogin(page);

  await page.getByRole("tab", { name: /Profil/ }).click();
  await vis(page, "Araç ekle").click();
  await vis(page, "Aracı kaydet").click();
  await expect(vis(page, /Araç tipini seçin|Kasa tipini seçin|Tonajı 0–60/)).toHaveCount(3);
  const plate = `34 TS ${100 + Math.floor(Math.random() * 899)}`;
  await page.getByLabel("Plaka").locator("visible=true").fill(plate);
  await vis(page, "Kamyon", true).first().click();
  await vis(page, "Kapalı kasa", true).first().click();
  await page.getByLabel("Taşıma kapasitesi (ton)").locator("visible=true").fill("12,5");
  await vis(page, "Aracı kaydet").click();
  const compact = plate.replace(/\s/g, "");
  await expect(vis(page, new RegExp(compact)).first()).toBeVisible();

  // İki araç varken boş araç formu seçim ister
  await page.getByRole("tab", { name: /Dönüş/ }).click();
  await vis(page, "Boş araç bildir").click();
  await vis(page, "Boş aracı bildir").click();
  await expect(vis(page, "Araç seçin")).toBeVisible();
  await page.goBack();

  await page.getByRole("tab", { name: /Profil/ }).click();
  await btn(page, `${compact} aracını sil`).click();
  await expect(vis(page, new RegExp(compact))).toHaveCount(0);
  expect(dialogs.at(-1)).toContain("Araç silinsin mi?");

  await page.getByRole("tab", { name: /Dönüş/ }).click();
  await vis(page, "Boş araç bildir").click();
  await expect(vis(page, /09DM0102/).first()).toBeVisible();
  await pickDistrict(page, 0, "Aydın", "Nazilli");
  await vis(page, "3 gün", true).click();
  await expect(vis(page, /^Müsait: .+ – .+/)).toBeVisible();
  await vis(page, "Boş aracı bildir").click();
  await expect(vis(page, "Uygun yükler")).toBeVisible();
  await expect(vis(page, /^Yükleme yeri \d+ km uzakta/).first()).toBeVisible();

  await btn(page, /→/).first().click();
  await expect(vis(page, "Teklif ver", true).last()).toBeVisible();
  await page.goBack();

  await vis(page, "Araç doldu").click();
  await expect(vis(page, "Doldu", true)).toBeVisible();
  expect(dialogs.at(-1)).toContain("İlanı kapat");
  await expect(vis(page, "Uygun yükler")).toHaveCount(0);
  await page.goBack();
  await expect(vis(page, /Nazilli, Aydın → Her yer/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("rota alarmı → yeni ilan bildirimi → zil → bildirimden yüke; aç/kapat ve sil", async ({ page }) => {
  const errors = collectErrors(page);
  const dialogs = acceptDialogs(page);
  await demoLogin(page);

  await page.getByRole("tab", { name: /Dönüş/ }).click();
  await vis(page, "Rota alarmlarım").click();
  await expect(vis(page, "Henüz alarm kurmadınız.")).toBeVisible();
  await vis(page, "Yeni alarm").click();
  await expect(vis(page, "Varışa en fazla")).toHaveCount(0);
  await vis(page, "Alarmı kur").click();
  await expect(vis(page, "Kalkış ilçesini seçin")).toBeVisible();
  await pickDistrict(page, 0, "Artvin", "Hopa");
  await expect(vis(page, "Kalkış ilçesini seçin")).toHaveCount(0);
  await vis(page, "25 km", true).first().click();
  await pickDistrict(page, 1, "Kars", "Merkez");
  await expect(vis(page, "Varışa en fazla")).toBeVisible();
  await vis(page, "Tır", true).first().click();
  await vis(page, "Alarmı kur").click();
  const route = "Hopa, Artvin (25 km) → Merkez, Kars (80 km)";
  await expect(vis(page, route)).toBeVisible();
  await expect(vis(page, "1 / 10 alarm açık")).toBeVisible();

  const [alert] = (await api<{ items: { originRadiusKm: number; destRadiusKm: number; vehicleType: string }[] }>("GET", "/alerts", demo)).body.items;
  expect(alert).toMatchObject({ originRadiusKm: 25, destRadiusKm: 80, vehicleType: "tir" });

  // Uyan yeni ilan → demo hesabına alarm bildirimi
  const shipper = await apiUser(phone(1), ["shipper"]);
  const admin = await adminToken(phone(9));
  const loadId = await apiLoad(shipper, admin, await districtId("Artvin", "Hopa"), await districtId("Kars", "Merkez"));
  await expect
    .poll(async () => (await api<{ items: { type: string; data: { loadId?: string } }[] }>("GET", "/notifications", demo)).body.items.find((n) => n.data.loadId === loadId)?.type)
    .toBe("route_alert");

  // Kapat / aç
  await page.getByRole("switch").locator("visible=true").click();
  await expect(vis(page, "0 / 10 alarm açık")).toBeVisible();
  await page.getByRole("switch").locator("visible=true").click();
  await expect(vis(page, "1 / 10 alarm açık")).toBeVisible();

  // Zil: sekmeye dönünce okunmamış sayısı tazelenir
  await page.goBack();
  await expect(btn(page, /^Bildirimler, \d+ okunmamış$/)).toBeVisible();
  await shot(page, "c1-zil");
  await btn(page, /^Bildirimler/).click();
  await shot(page, "c2-bildirimler");
  await btn(page, /^Okunmamış: Alarmınıza uygun yeni yük/).first().click();
  await expect(vis(page, /Hopa, Artvin/).first()).toBeVisible();
  await expect(vis(page, "Teklif ver", true).last()).toBeVisible();
  await page.goBack();
  await expect(btn(page, /^Alarmınıza uygun yeni yük/).first()).toBeVisible(); // artık okundu

  // Alarmı sil (onaylı)
  await page.goBack();
  await vis(page, "Rota alarmlarım").click();
  await btn(page, /^Alarmı sil:/).click();
  await expect(vis(page, "Henüz alarm kurmadınız.")).toBeVisible();
  expect(dialogs.at(-1)).toContain("Alarm silinsin mi?");
  expect((await api<{ items: unknown[] }>("GET", "/alerts", demo)).body.items).toHaveLength(0);

  psql(`update load_posts set status='iptal' where id='${loadId}'`);
  expect(errors).toEqual([]);
});

test("çevrimdışı: son kayıtlı yük listesi ve uyarı", async ({ page, context }) => {
  await demoLogin(page);
  await expect(vis(page, /^Teyitli ·/).first()).toBeVisible();
  const cards = await vis(page, /^Teyitli ·/).count();

  await context.setOffline(true);
  // Filtreyi açıp kapat: filtresiz liste yeniden istenir, ağ yok
  await vis(page, "Tır", true).first().click();
  await vis(page, "Tır", true).first().click();
  await expect(vis(page, /^Çevrimdışısınız · son güncelleme/)).toBeVisible();
  await shot(page, "c3-cevrimdisi");
  expect(await vis(page, /^Teyitli ·/).count()).toBe(cards);
  expect(await noHorizontalOverflow(page)).toBe(true);

  // Filtreliyken kayıt gösterilmez (filtreye uymaz)
  await vis(page, "Kamyon", true).first().click();
  await expect(vis(page, /^Çevrimdışısınız/)).toHaveCount(0);
  await expect(vis(page, /Sunucuya ulaşılamadı/).first()).toBeVisible();

  await context.setOffline(false);
  await vis(page, "Kamyon", true).first().click();
  await expect(vis(page, /^Teyitli ·/).first()).toBeVisible();
  await expect(vis(page, /^Çevrimdışısınız/)).toHaveCount(0);
});
