// Paylaşım (FR-16, F8): herkese açık ilan sayfası /ilan/<shareId> + önizleme kartı; panelde WhatsApp ve kopyala.
import { expect, test } from "@playwright/test";
import { loadShareText, sharePath } from "@nakliye/shared";
import { adminToken, api, apiUser, createLoad, phone } from "./helpers";

const BASE = "http://localhost:3001";

test("girişsiz paylaşım sayfası: ilan bilgisi, önizleme kartı, numara yok; panelde WhatsApp ve kopyala", async ({ browser }) => {
  const admin = await adminToken(904);
  const S = await apiUser(phone(401), "shipper", "Paylaşan Firma");
  const id = await createLoad(S.accessToken, admin);
  const l = (await api<{ shareId: string }>("GET", `/loads/${id}`, S.accessToken)).body as unknown as Parameters<typeof loadShareText>[0] & { shareId: string };
  const url = BASE + sharePath(l.shareId);

  // Girişsiz (çerezsiz) bağlam
  const anon = await browser.newContext();
  const p = await anon.newPage();
  await p.goto(url);
  await expect(p.getByRole("heading", { level: 1 })).toHaveText("Menteşe, Muğla → Muratpaşa, Antalya");
  await expect(p.getByText("12.500 ₺")).toBeVisible();
  await expect(p.getByText("Paylaşan Firma")).toBeVisible();
  await expect(p.getByText(/^Teyitli/)).toBeVisible();
  expect(await p.locator("body").innerText()).not.toMatch(/05\d\d|\+90|\*\*\*/); // numara (maskeli dahil) yok
  await expect(p.locator('meta[property="og:title"]')).toHaveAttribute("content", "Menteşe, Muğla → Muratpaşa, Antalya");
  await expect(p.locator('meta[property="og:description"]')).toHaveAttribute("content", /yükleme · 7 ton Palet · Kamyon · 12\.500 ₺$/);
  await expect(p.locator('meta[property="og:url"]')).toHaveAttribute("content", url);
  await expect(p.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await p.setViewportSize({ width: 390, height: 844 });
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Panel: WhatsApp bağlantısı paylaşım metnini taşır, kopyala bağlantıyı panoya yazar
  const ctx = await browser.newContext({ baseURL: BASE, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addCookies([
    { name: "nk_at", value: S.accessToken, url: BASE, httpOnly: true },
    { name: "nk_rt", value: S.refreshToken, url: BASE, httpOnly: true },
  ]);
  const panel = await ctx.newPage();
  await panel.goto(`/panel/ilanlar/${id}`);
  const wa = panel.getByRole("link", { name: "WhatsApp’ta paylaş" });
  await expect(wa).toHaveAttribute("href", `https://wa.me/?text=${encodeURIComponent(loadShareText(l, url))}`);
  await expect(wa).toHaveAttribute("rel", /noopener/);
  await panel.getByRole("button", { name: "Bağlantıyı kopyala" }).click();
  await expect(panel.getByRole("button", { name: "Kopyalandı" })).toBeVisible();
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe(url);

  // Kapanan ilan: paylaşım sayfası "yayında değil" der; panelde paylaşım düğmesi kalmaz
  expect((await api("POST", `/loads/${id}/close`, S.accessToken, { reason: "arac_bulundu" })).status).toBe(200);
  await p.reload();
  await expect(p.getByText("Bu ilan artık yayında değil.", { exact: false })).toBeVisible();
  await expect(p.getByText("12.500 ₺")).toHaveCount(0);
  await panel.reload();
  await expect(panel.getByRole("link", { name: "WhatsApp’ta paylaş" })).toHaveCount(0);

  await p.goto(BASE + "/ilan/AAAAAAAAAA");
  // role=alert değil: Next sayfa duyurucusu da taşır; metin de <title> ile karışmasın diye tam
  await expect(p.getByText("İlan bulunamadı. Bağlantı eksik kopyalanmış olabilir.")).toBeVisible();
  await anon.close();
  await ctx.close();
});
