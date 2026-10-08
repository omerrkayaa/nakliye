// Excel ile toplu ilan (FR-11, F5): şablon indir → doldur → yükle → önizle (satır satır hata) → yayınla.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { api, apiUser, phone } from "./helpers";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3001";
let context: BrowserContext;
let page: Page;
let S: Awaited<ReturnType<typeof apiUser>>;
let template: ExcelJS.Workbook;

const tr = (o: number) => new Date(Date.now() + 3 * 3600e3 + o * 86400e3);
const dmy = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;

async function upload(wb: ExcelJS.Workbook, name = "ilanlar.xlsx") {
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await page.getByLabel("Excel dosyası (.xlsx)").setInputFiles({ name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.getByRole("button", { name: "Önizle" }).click();
}

test.beforeAll(async ({ browser }) => {
  S = await apiUser(phone(501), "shipper", "Toplu İlan Deneme");
  context = await browser.newContext({ baseURL: BASE, acceptDownloads: true });
  await context.addCookies([
    { name: "nk_at", value: S.accessToken, url: BASE, httpOnly: true },
    { name: "nk_rt", value: S.refreshToken, url: BASE, httpOnly: true },
  ]);
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

test("İlanlarım'dan sayfaya; şablon: başlıklar, açılır listeler, açıklama, örnek satır veri sayfasında değil", async () => {
  await page.goto("/panel/ilanlar");
  await page.getByRole("link", { name: "Excel ile toplu ilan" }).click();
  await expect(page.getByRole("heading", { name: "Excel ile toplu ilan" })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Şablonu indir (.xlsx)" }).click()]);
  expect(download.suggestedFilename()).toBe("nakliye-toplu-ilan-sablonu.xlsx");
  template = new ExcelJS.Workbook();
  // exceljs tipleri eski Buffer tanımını bekliyor (çalışma zamanında Node Buffer kabul eder)
  await template.xlsx.load((await readFile((await download.path())!)) as unknown as ExcelJS.Buffer);
  const ws = template.getWorksheet("İlanlar")!;
  expect((ws.getRow(1).values as string[]).slice(1)).toEqual([
    "Kalkış il", "Kalkış ilçe", "Varış il", "Varış ilçe", "Yükleme başlangıç", "Yükleme bitiş", "Yük cinsi", "Ağırlık (ton)", "Araç tipi", "Kasa tipi", "Fiyat (₺)", "Not",
  ]);
  expect(ws.actualRowCount).toBe(1); // yalnız başlık
  expect(ws.getCell("G2").dataValidation?.formulae?.[0]).toContain("Palet");
  expect(ws.getCell("I2").dataValidation?.formulae?.[0]).toContain("Tır");
  expect(template.getWorksheet("Açıklama")!.getCell("A1").value).toContain("Excel ile toplu ilan");
});

test("yanlış dosya türü ve boş şablon anlaşılır hata verir", async () => {
  await page.getByLabel("Excel dosyası (.xlsx)").setInputFiles({ name: "ilanlar.csv", mimeType: "text/csv", buffer: Buffer.from("a;b\n1;2") });
  await page.getByRole("button", { name: "Önizle" }).click();
  await expect(page.getByText(/Yalnız \.xlsx dosyası yüklenebilir/)).toBeVisible();
  await upload(template);
  await expect(page.getByText("Dosyada ilan satırı yok. Başlıkların altına en az bir satır yazın.")).toBeVisible();
});

test("şablon doldurulup yüklenir: hazır ve hatalı satırlar ayrı; yalnız hazırlar yayınlanır", async () => {
  const ws = template.getWorksheet("İlanlar")!;
  const tomorrow = tr(1);
  // Kullanıcı gibi 2. satırdan yaz (addRow, açılır liste tanımlı 101. satırın altına eklerdi)
  let next = 2;
  const put = (values: ExcelJS.CellValue[]) => {
    ws.getRow(next++).values = values;
  };
  put(["Muğla", "Menteşe", "Antalya", "Muratpaşa", dmy(tomorrow), dmy(tr(2)), "Palet", 7, "Kamyon", "Tenteli", 12500, "Toplu satır A"]); // 2
  put(["istanbul", "ESENYURT", "Bursa", "Nilüfer", new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate())), "", "genel kargo", "12,5", "Tır", "", "", ""]); // 3
  put(["Muğla", "Yokköy", "Antalya", "Muratpaşa", dmy(tomorrow), "", "Palet", 7, "Kamyon", "", "", ""]); // 4
  put(["Muğla", "Menteşe", "Antalya", "Muratpaşa", "yarın", "", "Mobilya", "", "Kamyon", "", "", ""]); // 5
  put(["Muğla", "Menteşe", "Antalya", "Muratpaşa", dmy(tr(-2)), "", "Palet", 7, "Uçak", "", "-5", ""]); // 6
  next++; // boş satır atlanır
  await upload(template);

  await expect(page.getByText("ilanlar.xlsx: 2 satır hazır, 3 satırda hata var (yayınlanmaz)")).toBeVisible();
  const row = (n: number) => page.locator(`tr[data-row="${n}"]`);
  await expect(row(2)).toContainText("Menteşe, Muğla → Muratpaşa, Antalya");
  await expect(row(2)).toContainText("12.500 ₺");
  await expect(row(2)).toContainText("Hazır");
  await expect(row(3)).toContainText("Esenyurt, İstanbul → Nilüfer, Bursa"); // büyük/küçük harf duyarsız
  await expect(row(3)).toContainText("Teklif usulü");
  await expect(row(3)).toContainText("12,5 ton");
  await expect(row(4)).toContainText("Kalkış ilçe Muğla ilinde bulunamadı: “Yokköy”");
  await expect(row(5)).toContainText("Yükleme başlangıç tarihi anlaşılamadı: “yarın”");
  await expect(row(5)).toContainText("Yük cinsi tanınmadı: “Mobilya”");
  await expect(row(5)).toContainText("Ağırlık 0–60 ton arasında bir sayı olmalı");
  await expect(row(6)).toContainText("Araç tipi tanınmadı: “Uçak”");
  await expect(row(6)).toContainText("Fiyat pozitif bir sayı olmalı");
  await expect(row(6)).toContainText("Yükleme"); // geçmiş tarih (shared kuralı)
  await expect(page.locator("tr[data-row]")).toHaveCount(5);

  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/toplu-onizleme.png`, fullPage: true });
  await page.getByRole("button", { name: "2 ilanı yayınla" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 ilan açıldı." })).toBeVisible();
  await expect(row(2).getByRole("link", { name: "Onay bekliyor" })).toBeVisible(); // yeni hesap: BR-11
  await expect(row(3).getByRole("link", { name: "Onay bekliyor" })).toBeVisible();
  await expect(page.getByRole("button", { name: /ilanı yayınla$/ })).toHaveCount(0); // ikinci kez gönderilemez

  const mine = (await api<{ items: { note: string | null; weightTon: number; priceType: string }[] }>("GET", "/loads/mine", S.accessToken)).body.items;
  expect(mine).toHaveLength(2);
  expect(mine.find((l) => l.note === "Toplu satır A")?.priceType).toBe("sabit");
  expect(mine.find((l) => l.note === null)?.weightTon).toBe(12.5);

  await page.getByRole("link", { name: "İlanlarıma git" }).click();
  await expect(page.locator("tr[data-load-id]")).toHaveCount(2);
});
