// Yük sahibi paneli: giriş (P1), İlanlarım (P4), SMS teyit sayfası (F1), oturum yenileme ve çıkış.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { adminToken, api, createLoad, localPhone, otpFor, phone, psql, sha256 } from "./helpers";

const BASE = "http://localhost:3001";

test.describe.configure({ mode: "serial" });

const P = phone(1);
let context: BrowserContext;
let page: Page;
let admin: string;
let loadId: string;

const cookie = async (name: string) => (await context.cookies()).find((c) => c.name === name);
const row = () => page.locator(`tr[data-load-id="${loadId}"]`);

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ baseURL: BASE });
  page = await context.newPage();
  admin = await adminToken();
});

test.afterAll(async () => {
  // Diğer takımların listelerine karışmasın
  psql(`update load_posts set status='iptal' where status in ('teyitli','teyit_bekliyor','moderasyonda') and shipper_id in (select id from users where phone like '+90559%')`);
  await context.close();
});

test("girişsiz panel girişe yönlendirir (dönüş adresiyle)", async () => {
  await page.goto("/panel/ilanlar");
  await expect(page).toHaveURL(/\/giris\?sonra=%2Fpanel%2Filanlar$/);
});

test("geçersiz telefon formda hata gösterir", async () => {
  await page.getByLabel("Cep telefonu").fill("123");
  await page.getByRole("button", { name: "SMS kodu gönder" }).click();
  await expect(page.locator("#login-error")).toHaveText("Geçerli bir cep telefonu numarası girin");
});

test("OTP ile giriş: yanlış kod hata verir, doğru kodla panel açılır; dış adrese dönülmez", async () => {
  await page.goto("/giris?sonra=%2F%2Fkotu.example.com");
  await page.getByLabel("Cep telefonu").fill(localPhone(P));
  await page.getByRole("button", { name: "SMS kodu gönder" }).click();
  const codeInput = page.getByLabel(/numarasına gelen kod/);
  await expect(codeInput).toBeVisible();
  const code = await otpFor(P);
  await codeInput.fill(code === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.locator("#login-error")).toHaveText("Kod hatalı");
  await codeInput.fill(code);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(/\/panel\/ilanlar$/);
});

test("belirteçler httpOnly çerezde; sayfa JavaScript'i göremez", async () => {
  expect((await cookie("nk_at"))?.httpOnly).toBe(true);
  expect((await cookie("nk_rt"))?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("nk_");
});

test("yeni kullanıcı yük sahibi rolünü seçer, boş liste görür", async () => {
  await page.getByRole("button", { name: "Yük sahibi olarak devam et" }).click();
  await expect(page.getByText("Henüz ilanınız yok.")).toBeVisible();
});

const day = (offset: number) => new Date(Date.now() + 3 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
const fillLoadForm = async () => {
  await page.getByLabel("Kalkış ili", { exact: true }).selectOption({ label: "Muğla" });
  await page.getByLabel("Kalkış ilçesi", { exact: true }).selectOption({ label: "Menteşe" });
  await page.getByLabel("Varış ili", { exact: true }).selectOption({ label: "Antalya" });
  await page.getByLabel("Varış ilçesi", { exact: true }).selectOption({ label: "Muratpaşa" });
  await page.getByLabel("En erken").fill(day(1));
  await page.getByLabel("En geç").fill(day(2));
  await page.getByLabel("Yük cinsi").selectOption({ label: "Palet" });
  await page.getByLabel("Ağırlık (ton)").fill("7");
  await page.getByLabel("Araç tipi").selectOption({ label: "Kamyon" });
  await page.getByLabel("Sabit fiyat veriyorum").check();
  await page.getByLabel("Tutar (₺, KDV hariç)").fill("12500");
};

test("ilan formu: boş gönderimde alan hataları", async () => {
  await page.getByRole("link", { name: "Yeni ilan" }).first().click();
  await expect(page).toHaveURL(/\/panel\/ilanlar\/yeni$/);
  await page.getByRole("button", { name: "İlanı yayınla" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Formdaki işaretli alanları düzeltin" })).toBeVisible();
  await expect(page.getByText("Kalkış ilçesini seçin")).toBeVisible();
  await expect(page.getByText("Ağırlığı ton olarak girin (en fazla 60)")).toBeVisible();
  await expect(page.getByLabel("Ağırlık (ton)")).toHaveAttribute("aria-invalid", "true");
});

test("ilan formu: API hatası gösterilir, girilen değerler korunur", async () => {
  await fillLoadForm();
  await page.getByLabel("En geç").fill(day(45)); // aralık 30 günü aşar: API reddeder
  await page.getByRole("button", { name: "İlanı yayınla" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "en fazla 30 gün" })).toBeVisible();
  await expect(page.getByLabel("Ağırlık (ton)")).toHaveValue("7");
  await expect(page.getByLabel("Kalkış ilçesi", { exact: true })).toHaveValue(/\d+/);
});

test("ilan formu: geçerli ilan oluşur, yeni hesabın ilk ilanı onaya gider (BR-11)", async () => {
  await page.getByLabel("En geç").fill(day(2));
  await page.getByRole("button", { name: "İlanı yayınla" }).click();
  await expect(page).toHaveURL(/\/panel\/ilanlar\/[0-9a-f-]{36}\?yeni=1$/);
  loadId = page.url().match(/ilanlar\/([0-9a-f-]{36})/)![1]!;
  await expect(page.getByRole("status")).toContainText("kısa bir kontrolden sonra yayına çıkar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Menteşe, Muğla → Muratpaşa, Antalya");
  await expect(page.getByText("Onay bekliyor")).toBeVisible();
  await expect(page.getByText("Palet, 7 ton")).toBeVisible();
  await expect(page.getByText("12.500 ₺")).toBeVisible();
  // Moderasyondaki ilan yalnız iptal edilebilir, teyit edilemez
  await expect(page.getByRole("button", { name: "Hâlâ geçerli" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Araç buldum, kapat" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "İlanı iptal et" })).toBeVisible();
});

test("onaylanan ilan listede: güzergâh, fiyat, durum ve son teyit", async () => {
  await api("POST", `/admin/loads/${loadId}/review`, admin, { decision: "onay" });
  await page.goto("/panel/ilanlar");
  await expect(row()).toContainText("Menteşe, Muğla → Muratpaşa, Antalya");
  await expect(row()).toContainText("12.500 ₺");
  await expect(row()).toContainText("Teyitli");
  await expect(row()).toContainText("az önce");
});

test("teyit bekleyen ilan 'Hâlâ geçerli' ile teyitliye döner", async () => {
  psql(`update load_posts set status='teyit_bekliyor', last_confirmed_at = now() - interval '30 hours' where id='${loadId}'`);
  await page.reload();
  await expect(row()).toContainText("Teyit bekliyor");
  await expect(row()).toContainText("1 gün önce");
  await row().getByRole("button", { name: "Hâlâ geçerli" }).click();
  await expect(row()).toContainText("Teyitli");
  await expect(row()).toContainText("az önce");
  expect(psql(`select status from load_posts where id='${loadId}'`)).toBe("teyitli");
});

test("API hatası satırda gösterilir (yükleme tarihi geçmiş)", async () => {
  psql(`update load_posts set load_from = current_date - 3, load_to = current_date - 2 where id='${loadId}'`);
  await page.reload();
  await row().getByRole("button", { name: "Hâlâ geçerli" }).click();
  await expect(row().getByRole("alert")).toContainText("Yükleme tarihi geçmiş");
  psql(`update load_posts set load_from = current_date + 1, load_to = current_date + 2 where id='${loadId}'`);
});

test("ilan sayfasından iptal: onay sorulur, vazgeçilirse bir şey olmaz", async () => {
  const other = await createLoad((await cookie("nk_at"))!.value, admin);
  await page.goto(`/panel/ilanlar/${other}`);
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Araç buldum, kapat" }).click();
  await expect(page.getByText("Teyitli")).toBeVisible();
  expect(psql(`select status from load_posts where id='${other}'`)).toBe("teyitli");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "İlanı iptal et" }).click();
  await expect(page.getByText("İptal", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "İlanı iptal et" })).toHaveCount(0);
  expect(psql(`select status from load_posts where id='${other}'`)).toBe("iptal");
});

test("toplu teyit: seçilenler ya da tümü; seçim yoksa uyarı", async () => {
  const token = (await cookie("nk_at"))!.value;
  const b1 = await createLoad(token, admin);
  const b2 = await createLoad(token, admin);
  const ids = [loadId, b1, b2].map((x) => `'${x}'`).join(",");
  psql(`update load_posts set status='teyit_bekliyor', last_confirmed_at = now() - interval '30 hours' where id in (${ids})`);
  await page.goto("/panel/ilanlar");
  await page.getByRole("button", { name: "Seçilenleri teyit et" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Teyit edilecek ilan seçmediniz." })).toBeVisible();

  await page.locator(`tr[data-load-id="${b1}"]`).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Seçilenleri teyit et" }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 ilan teyit edildi." })).toBeVisible();
  expect(psql(`select id || ':' || status from load_posts where id in (${ids}) order by status, id`).split("\n").filter((x) => x.endsWith(":teyitli"))).toEqual([`${b1}:teyitli`]);
  await expect(page.locator(`tr[data-load-id="${b1}"]`)).toContainText("az önce");

  await page.getByRole("button", { name: "Tümünü teyit et (3)" }).click();
  await expect(page.getByRole("status").filter({ hasText: "3 ilan teyit edildi." })).toBeVisible();
  expect(psql(`select count(*) from load_posts where id in (${ids}) and status='teyitli' and last_confirmed_at > now() - interval '1 minute'`)).toBe("3");
  psql(`update load_posts set status='iptal' where id in ('${b1}','${b2}')`);
});

test("erişim çerezi düşünce refresh ile sessizce yenilenir (refresh de döner)", async () => {
  const oldRefresh = (await cookie("nk_rt"))!.value;
  await context.clearCookies({ name: "nk_at" });
  await page.goto("/panel/ilanlar");
  await expect(page).toHaveURL(/\/panel\/ilanlar$/);
  await expect(row()).toBeVisible();
  expect(await cookie("nk_at")).toBeDefined();
  expect((await cookie("nk_rt"))!.value).not.toBe(oldRefresh);
});

test("girişliyken /giris panele yönlendirir", async () => {
  await page.goto("/giris");
  await expect(page).toHaveURL(/\/panel\/ilanlar$/);
});

test("API belirteci reddederse girişe düşer, döngü olmaz", async () => {
  await context.addCookies([{ name: "nk_at", value: "bozuk", url: BASE }]);
  await page.goto("/panel/ilanlar");
  await expect(page).toHaveURL(/\/giris\?oturum=gecersiz$/);
  await expect(page.getByText("Oturumunuz sona erdi")).toBeVisible();
  await context.clearCookies({ name: "nk_at" }); // refresh hâlâ geçerli: sonraki testte proxy yeniler
});

test("SMS teyit linki: giriş olmadan ilanı gösterir, cevap tek kullanımlık", async ({ browser }) => {
  const token = `webtest${Date.now().toString(36)}`.padEnd(16, "x").slice(0, 16);
  psql(`insert into load_confirmations(load_post_id, sms_sent_at, sms_token_hash) values ('${loadId}', now(), '${sha256(token)}')`);
  const anonCtx = await browser.newContext({ baseURL: BASE }); // oturumsuz tarayıcı
  const anon = await anonCtx.newPage();
  await anon.goto(`/t/${token}`);
  await expect(anon.getByRole("heading", { name: "İlanınız hâlâ geçerli mi?" })).toBeVisible();
  await expect(anon.getByText("Menteşe, Muğla → Muratpaşa, Antalya")).toBeVisible();
  await expect(anon.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(anon.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await anon.getByRole("button", { name: "Araç buldum, ilanı kapat" }).click();
  await expect(anon.getByRole("status")).toContainText("İlanınız kapatıldı");
  expect(psql(`select status from load_posts where id='${loadId}'`)).toBe("kapandi");
  expect(psql(`select channel from load_confirmations where sms_token_hash='${sha256(token)}'`)).toBe("sms");
  await anon.reload();
  // Next'in sayfa duyurucusu da role=alert taşır: metinle süzülür
  await expect(anon.getByRole("alert").filter({ hasText: "Bağlantı geçersiz ya da kullanılmış" })).toBeVisible();
  await anonCtx.close();
});

test("çıkış: panele erişim kapanır, refresh API'de iptal edilir", async () => {
  const oldRefresh = (await cookie("nk_rt"))!.value;
  await page.goto("/panel/ilanlar");
  await page.getByRole("button", { name: "Çıkış" }).click();
  await expect(page).toHaveURL(/\/giris$/);
  expect(await cookie("nk_rt")).toBeUndefined();
  await page.goto("/panel/ilanlar");
  await expect(page).toHaveURL(/\/giris\?sonra=/);
  expect((await api("POST", "/auth/refresh", undefined, { refreshToken: oldRefresh })).status).toBe(401);
});
