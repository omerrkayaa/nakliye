// Herkese açık site: W1 tanıtım ve W4 yasal sayfalar (girişsiz).
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { adminToken, API, api, apiUser, createLoad, localPhone, otpFor, phone, psql } from "./helpers";

test.use({ baseURL: "http://localhost:3001" });

test("tanıtım sayfası: değer önerisi, panele giriş, nasıl çalışır ve rozetler", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gördüğün her yük gerçek ve şu an geçerli.");
  await expect(page.getByRole("link", { name: "Yük sahibiyim, panele gir" })).toHaveAttribute("href", "/panel");
  await expect(page.getByRole("form", { name: "Yük ilanı ver" })).toBeVisible();
  await expect(page.getByText("Nakliyeci uygulaması (Android) yakında")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nasıl çalışır" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kartlardaki işaretler ne anlama geliyor?" })).toBeVisible();
  // Panel ve uygulama ekranları: üç görüntü yükleniyor ve açıklamalı
  const shots = page.getByRole("region", { name: "Panel ve uygulama" }).getByRole("img");
  await expect(shots).toHaveCount(3);
  for (const img of await shots.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute("alt", /.{40,}/);
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  }
  // Sayfa sonundaki çağrı ilan formuna gider
  await expect(page.getByRole("region", { name: "Yükünüzü bugün ilan edin" }).getByRole("link", { name: "İlan ver" })).toHaveAttribute("href", "/panel/ilanlar/yeni");
  // Girişsiz panel → giriş sayfası
  await page.getByRole("link", { name: "Yük sahibiyim, panele gir" }).click();
  await expect(page).toHaveURL(/\/giris\?sonra=%2Fpanel$/);
  await expect(page.getByRole("link", { name: "kullanım şartlarını" })).toHaveAttribute("href", "/kullanim-sartlari");
  await expect(page.getByRole("link", { name: "KVKK aydınlatma metnini" })).toHaveAttribute("href", "/kvkk");
});

test("nasıl çalışır: yük sahibi / nakliyeci sekmeleri klavyeyle; #nakliyeci bağlantısı nakliyeci sekmesini açar", async ({ page }) => {
  await page.goto("/");
  const shipper = page.getByRole("tab", { name: "Yük sahibiyim" });
  const carrier = page.getByRole("tab", { name: "Nakliyeciyim" });
  await expect(shipper).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Nakliyecilerim");
  await expect(page.getByRole("tabpanel").getByRole("link", { name: "İlan ver" })).toHaveAttribute("href", "/panel/ilanlar/yeni");
  await shipper.focus();
  await page.keyboard.press("ArrowRight");
  await expect(carrier).toBeFocused();
  await expect(carrier).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Rota alarmı");
  await page.keyboard.press("ArrowRight"); // başa döner
  await expect(shipper).toHaveAttribute("aria-selected", "true");
  await page.goto("/#nakliyeci");
  await expect(carrier).toHaveAttribute("aria-selected", "true");
});

test("Dönüş Planı canlandırması: rota üstü kuralıyla uyan ve elenen örnekler; hareketi azaltınca durur; iki temada WCAG AA", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    const section = page.getByRole("region", { name: "Gidiş dolu, dönüş de dolu" });
    await section.scrollIntoViewIfNeeded();
    // Hareketi azaltılmış: oynat düğmesi yok, 2. adımın son hâli (koridor ve ilanlar görünür)
    await expect(section.getByRole("button", { name: /Canlandırmayı/ })).toHaveCount(0);
    await expect(section.getByRole("button", { name: /Yoldayken Dönüş Planı/ })).toHaveAttribute("aria-current", "step");
    const items = section.getByRole("listitem").filter({ hasText: "→" });
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText(/Gebze → Manisa.*Kalkış rotadan \d+ km, varış \d+ km sapıyor/);
    await expect(items.nth(1)).toContainText("Bursa → Ankara");
    await expect(items.nth(1)).toContainText("Elendi: varışı rotadan uzak");
    await expect(items.nth(2)).toContainText("İzmir → İstanbul");
    await expect(items.nth(2)).toContainText("Elendi: ters yönde");
    // Adıma tıklayınca o adımın son hâli
    await section.getByRole("button", { name: /dolu döndü/ }).click();
    await expect(section.getByRole("button", { name: /dolu döndü/ })).toHaveAttribute("aria-current", "step");
    const r = await new AxeBuilder({ page }).include("#donus-plani").include("#nasil-calisir").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${scheme}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});

test("rota formu: 81 il API ile aynı ve alfabetik; girişsiz gönderim girişten sonra ilan formunu illerle açar", async ({ page }) => {
  const provinces = (await (await fetch(`${API}/locations`)).json()) as { id: number; name: string }[];
  await page.goto("/");
  const form = page.getByRole("form", { name: "Yük ilanı ver" });
  const from = form.getByLabel("Nereden");
  const options = await from.locator("option:not([disabled])").evaluateAll((os) => os.map((o) => [Number((o as HTMLOptionElement).value), o.textContent ?? ""] as const));
  expect([...options].sort((a, b) => a[0] - b[0])).toEqual(provinces.map((p) => [p.id, p.name]));
  expect(options.map(([, n]) => n)).toEqual(provinces.map((p) => p.name).sort((a, b) => a.localeCompare(b, "tr")));

  // İl seçilmeden gönderilmez (tarayıcı doğrulaması)
  await form.getByRole("button", { name: "İlan ver" }).click();
  await expect(page).toHaveURL(/:3001\/$/);
  await from.selectOption({ label: "Aydın" });
  await form.getByLabel("Nereye").selectOption({ label: "İstanbul" });
  await form.getByRole("button", { name: "İlan ver" }).click();
  await expect(page).toHaveURL(/\/giris\?sonra=%2Fpanel%2Filanlar%2Fyeni%3Fnereden%3D9%26nereye%3D34$/);

  // Yeni hesap: giriş → yük sahibi rolü → ilan formunda iller seçili, ilçe kullanıcıda
  const me = phone(980);
  await page.getByLabel("Cep telefonu").fill(localPhone(me));
  await page.getByRole("button", { name: "SMS kodu gönder" }).click();
  await page.getByLabel(/numarasına gelen kod/).fill(await otpFor(me));
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(/\/panel\/ilanlar\/yeni\?nereden=9&nereye=34$/);
  await page.getByRole("button", { name: "Yük sahibi olarak devam et" }).click();
  await expect(page.getByLabel("Kalkış ili", { exact: true })).toHaveValue("9");
  await expect(page.getByLabel("Varış ili", { exact: true })).toHaveValue("34");
  await expect(page.getByLabel("Kalkış ilçesi", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Kalkış ilçesi", { exact: true })).toBeEnabled();
  await page.getByLabel("Kalkış ilçesi", { exact: true }).selectOption({ label: "Nazilli" });

  // Listede olmayan il yok sayılır
  await page.goto("/panel/ilanlar/yeni?nereden=99&nereye=abc");
  await expect(page.getByLabel("Kalkış ili", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Varış ili", { exact: true })).toHaveValue("");
});

test("canlı yük akışı: istek anında, en son teyit edilen önde; numara, fiyat ve ilan bağlantısı yok", async ({ page }) => {
  const A = await adminToken(908);
  const S = (await apiUser(phone(981), "shipper")).accessToken;
  const id = await createLoad(S, A); // Menteşe → Muratpaşa, palet 7 ton, kamyon, sabit 12.500 ₺
  psql(`update load_posts set last_confirmed_at = now() + interval '1 minute' where id='${id}'`); // en son teyit edilen olsun
  const total = (await api<{ activeLoads: number }>("GET", "/public/feed")).body.activeLoads!;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: `Şu an yayında ${total} ilan`, exact: true })).toBeVisible();
  const feed = page.getByTestId("feed");
  await expect(feed.getByRole("listitem")).toHaveCount(Math.min(6, total));
  const first = feed.getByRole("listitem").first();
  await expect(first).toContainText("Menteşe, Muğla → Muratpaşa, Antalya");
  await expect(first).toContainText("Palet · 7 ton · Kamyon");
  await expect(first).toContainText("Teyitli");
  await expect(first).toContainText("Son teyit az önce");
  await expect(feed).not.toContainText("12.500");
  await expect(feed.getByRole("link")).toHaveCount(0);
  // Telefonda ilk üçü
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(feed.getByRole("listitem")).toHaveCount(Math.min(3, total));
  await page.setViewportSize({ width: 1280, height: 720 });

  // Sayfa önbellekten gelmiyor: ilan kapanınca sayı düşer
  await api("POST", `/loads/${id}/close`, S, { reason: "iptal" });
  await page.reload();
  await expect(page.getByRole("heading", { name: `Şu an yayında ${total - 1} ilan`, exact: true })).toBeVisible();
});

test("SSS: başlıktan açılır, cevaplar kapalı başlar ve tıklayınca açılır", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "SSS" }).click();
  await expect(page).toHaveURL(/#sss$/);
  const faq = page.locator("#sss");
  await expect(faq.getByRole("heading", { name: "Sık sorulan sorular" })).toBeVisible();
  await expect(faq.locator("summary")).toHaveCount(11);
  const answer = faq.getByText("bir kişi 24 saatte en çok 30 ilanın numarasını açabilir");
  await expect(answer).toBeHidden();
  await faq.getByText("Numaram kimlere görünür?").click();
  await expect(answer).toBeVisible();
  // Klavyeyle de açılır
  await faq.getByText("Teslim kodu nedir?").focus();
  await page.keyboard.press("Enter");
  await expect(faq.getByText("48 saat içinde itiraz edebilirsiniz")).toBeVisible();
});

test("yasal sayfalar: alt bilgiden açılır, taslak uyarısı var", async ({ page }) => {
  await page.goto("/");
  for (const [link, heading] of [
    ["KVKK aydınlatma metni", "Kişisel verilerin işlenmesine ilişkin aydınlatma metni"],
    ["Kullanım şartları", "Kullanım şartları"],
    ["İletişim", "İletişim"],
  ]) {
    await page.getByRole("contentinfo").getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByRole("note")).toContainText("Bu metin taslaktır");
  }
});

test("telefon genişliğinde (390 px) herkese açık sayfalar yatay taşmaz", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/kvkk", "/kullanim-sartlari", "/iletisim", "/giris"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
    if (process.env.SHOTS && path === "/") await page.screenshot({ path: `${process.env.SHOTS}/tanitim-390.png`, fullPage: true });
  }
  if (process.env.SHOTS) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.screenshot({ path: `${process.env.SHOTS}/tanitim.png`, fullPage: true });
  }
});
