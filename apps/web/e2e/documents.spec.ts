// FR-05 / Y1: yük sahibi firma sayfasında vergi levhası yükler; yönetici kuyrukta açar, reddeder ve onaylar; onayla firma
// doğrulanır. Dosya BFF rotasından (/panel/belgeler/<id>) açılır; başkası açamaz. Hazırlık API ile.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { adminToken, api, apiUser, phone, psql } from "./helpers";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3001";
type User = Awaited<ReturnType<typeof apiUser>>;
let admin: string;
let S: User;
let ctx: BrowserContext;
let page: Page;

const PDF = Buffer.from("%PDF-1.4\n% web testi\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("web-testi")]);

async function browserWith(browser: Browser, access: string, refresh?: string) {
  const c = await browser.newContext({ baseURL: BASE });
  await c.addCookies([
    { name: "nk_at", value: access, url: BASE, httpOnly: true },
    ...(refresh ? [{ name: "nk_rt", value: refresh, url: BASE, httpOnly: true }] : []),
  ]);
  return c;
}
const pick = (p: Page, name: string, mimeType: string, buffer: Buffer) => p.getByLabel(/Vergi levhası \(PDF|İncelemedekinin yerine/).setInputFiles({ name, mimeType, buffer });
const latestDoc = () => psql(`select id from documents where owner_user_id='${S.id}' order by created_at desc limit 1`);
/** Bekleyen kuyruğu eskiden yeniye, 20'lik sayfalı: başka takımların bekleyen belgeleri öndeyse belge sonraki sayfadadır */
async function pendingPageOf(id: string) {
  for (let n = 1; n <= 50; n++) {
    const r = await api<{ items: { id: string }[]; hasMore: boolean }>("GET", `/admin/documents?status=bekliyor&page=${n}`, admin);
    if (r.body.items.some((d) => d.id === id)) return n;
    if (!r.body.hasMore) break;
  }
  throw new Error(`Belge kuyrukta yok: ${id}`);
}

test.beforeAll(async ({ browser }) => {
  admin = await adminToken(920);
  S = await apiUser(phone(821), "shipper", "Levha Deneme");
  await api("POST", "/companies", S.accessToken, { title: "Levha Ticaret Ltd. Şti.", taxNo: "1234567890", taxOffice: "Muğla" });
  ctx = await browserWith(browser, S.accessToken, S.refreshToken);
  page = await ctx.newPage();
});

test.afterAll(async () => {
  await ctx.close();
});

test("vergi levhası: büyük dosya gönderilmeden, türü gizlenmiş dosya API'de reddedilir; PDF yüklenir ve açılır", async () => {
  await page.goto("/panel/firma");
  await expect(page.getByTestId("tax-plate-status")).toHaveText("Firmanızın doğrulanması (✅ rozeti) için vergi levhanızı yükleyin.");

  await pick(page, "buyuk.pdf", "application/pdf", Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]));
  await page.getByRole("button", { name: "Vergi levhasını yükle" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "MB" })).toHaveText("Dosya en çok 10 MB olabilir");
  expect(psql(`select count(*) from documents where owner_user_id='${S.id}'`)).toBe("0");

  await pick(page, "levha.pdf", "application/pdf", Buffer.from("<html><script>alert(1)</script></html>"));
  await page.getByRole("button", { name: "Vergi levhasını yükle" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "PDF" })).toHaveText("Yalnız PDF, JPEG ya da PNG yükleyebilirsiniz");

  await pick(page, "levha.pdf", "application/pdf", PDF);
  await page.getByRole("button", { name: "Vergi levhasını yükle" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Yüklendi" })).toBeVisible();
  await expect(page.getByTestId("tax-plate-status")).toHaveText("Vergi levhanız inceleniyor. Onaylanınca firmanız doğrulanır.");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/firma-levha.png`, fullPage: true });

  const id = latestDoc();
  await expect(page.getByRole("link", { name: "Yüklenen belgeyi aç" })).toHaveAttribute("href", `/panel/belgeler/${id}`);
  const res = await page.request.get(`/panel/belgeler/${id}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(Buffer.from(await res.body()).equals(PDF)).toBe(true);
});

test("levha yükleme rotası: başka siteden ya da kökensiz istek 403; sınırı aşan gövde 413; hiçbiri belge yazmaz", async () => {
  const count = () => psql(`select count(*) from documents where owner_user_id='${S.id}'`);
  const before = count();
  const file = (buffer: Buffer) => ({ file: { name: "levha.pdf", mimeType: "application/pdf", buffer } });
  let r = await page.request.post("/panel/firma/levha", { multipart: file(PDF), headers: { origin: "https://kotu.example.com" } });
  expect(r.status()).toBe(403);
  r = await page.request.post("/panel/firma/levha", { multipart: file(PDF) }); // tarayıcı POST'ta Origin'i hep yazar
  expect(r.status()).toBe(403);
  r = await page.request.post("/panel/firma/levha", { multipart: file(Buffer.alloc(10 * 1024 * 1024 + 70 * 1024)), headers: { origin: BASE } });
  expect(r.status()).toBe(413);
  expect((await r.json()).error).toBe("Dosya en çok 10 MB olabilir");
  expect(count()).toBe(before);
});

test("başka kullanıcı belgeyi açamaz (BFF 404)", async ({ browser }) => {
  const O = await apiUser(phone(822), "shipper");
  const c = await browserWith(browser, O.accessToken, O.refreshToken);
  const res = await c.request.get(`${BASE}/panel/belgeler/${latestDoc()}`);
  expect(res.status()).toBe(404);
  await c.close();
});

test("yönetici: kuyrukta firma bilgisiyle; ret sebepsiz olmaz, sebeple reddedilir → yük sahibi görür; yeniden yükleme onaylanınca firma doğrulanır", async ({ browser }) => {
  const a = await browserWith(browser, admin);
  const ap = await a.newPage();
  await ap.goto("/panel/yonetim");
  // İlk sayfanın içeriği akarken tıklanan geçiş arada kayboluyordu (4 denemenin 2'si); içerik gelince tıkla
  await expect(ap.getByRole("heading", { name: "Onay bekleyen ilanlar" })).toBeVisible();
  await ap.getByRole("link", { name: "Belgeler", exact: true }).click();
  await expect(ap).toHaveURL(/\/panel\/yonetim\/belgeler$/);
  let n = await pendingPageOf(latestDoc());
  if (n > 1) await ap.goto(`/panel/yonetim/belgeler?sayfa=${n}`);
  let item = ap.locator(`[data-document-id="${latestDoc()}"]`);
  await expect(item).toContainText("Vergi levhası");
  await expect(item).toContainText("Levha Ticaret Ltd. Şti.");
  await expect(item).toContainText("VKN 1234567890");
  const open = await a.request.get(`${BASE}${await item.getByRole("link", { name: /Belgeyi aç/ }).getAttribute("href")}`);
  expect(open.status()).toBe(200);

  ap.on("dialog", (d) => void d.accept());
  await item.getByRole("button", { name: "Reddet" }).click();
  await expect(item.getByRole("alert")).toHaveText("Ret sebebini en az 5 karakterle yazın");
  await item.getByLabel("Ret sebebi (retde zorunlu)").fill("Belge okunmuyor, yeniden çekin");
  await item.getByRole("button", { name: "Reddet" }).click();
  await expect(item).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("tax-plate-status")).toHaveText("Vergi levhanız reddedildi: Belge okunmuyor, yeniden çekin. Düzeltip yeniden yükleyin.");
  await pick(page, "levha.png", "image/png", PNG);
  await page.getByRole("button", { name: "Vergi levhasını yükle" }).click();
  await expect(page.getByTestId("tax-plate-status")).toHaveText("Vergi levhanız inceleniyor. Onaylanınca firmanız doğrulanır.");

  n = await pendingPageOf(latestDoc());
  await ap.goto(`/panel/yonetim/belgeler${n > 1 ? `?sayfa=${n}` : ""}`);
  item = ap.locator(`[data-document-id="${latestDoc()}"]`);
  await expect(item).toContainText("Belgeyi aç (görsel)");
  if (process.env.SHOTS) await ap.screenshot({ path: `${process.env.SHOTS}/belgeler-kuyruk.png`, fullPage: true });
  await item.getByRole("button", { name: "Onayla" }).click();
  await expect(item).toHaveCount(0);
  await ap.goto("/panel/yonetim/belgeler?durum=onay");
  await expect(ap.locator(`[data-document-id="${latestDoc()}"]`)).toContainText("Onaylandı");

  await page.reload();
  await expect(page.getByTestId("tax-plate-status")).toHaveText("Vergi levhanız onaylandı; firmanız doğrulandı.");
  await expect(page.getByText("Firma doğrulandı")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vergi levhasını yükle" })).toHaveCount(0);
  expect(psql(`select verification_level from users where id='${S.id}'`)).toBe("1");
  expect(psql(`select count(*) from documents where owner_user_id='${S.id}'`)).toBe("1"); // reddedilen eski kayıt silindi

  await ap.setViewportSize({ width: 390, height: 844 });
  await ap.goto("/panel/yonetim/belgeler?durum=onay");
  await expect(ap.locator(`[data-document-id="${latestDoc()}"]`)).toBeVisible(); // içerik gelmeden ölçülürse "Yükleniyor…" ölçülür
  expect(await ap.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.SHOTS) await ap.screenshot({ path: `${process.env.SHOTS}/belgeler-390.png`, fullPage: true });
  await a.close();
});
