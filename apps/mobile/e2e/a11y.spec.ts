// NFR-06 erişilebilirlik (mobil): Expo web derlemesinde (390 px) WCAG 2.0/2.1/2.2 A ve AA otomatik tarama (axe-core).
// React Native erişilebilirlik özellikleri (accessibilityRole/Label) web'de ARIA'ya dönüşür; tarama ad, rol, kontrast
// ve hedef boyutunu denetler. Telefondaki ekran okuyucu (TalkBack/VoiceOver) denemesinin yerini tutmaz.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { demoLogin, vis } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page, label: string) {
  // Expo Router önceki ekranları DOM'da gizli tutar: yalnız görünen ekran taransın
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  // RN web sınıf adları anlamsız: öğenin metni ve (kontrastta) renkler raporlanır
  const describe = (n: (typeof r.violations)[number]["nodes"][number]) => {
    const d = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
    const text = n.html.replace(/<[^>]+>/g, "").trim().slice(0, 30);
    return d?.fgColor ? `“${text}” ${d.fgColor}/${d.bgColor} ${d.contrastRatio}:1` : `“${text}”`;
  };
  return r.violations.map((v) => `${label}: [${v.impact}] ${v.id} (${v.nodes.length}) ${v.help} → ${v.nodes.slice(0, 4).map(describe).join(" | ")}`);
}

test("giriş, sekmeler ve profil sayfaları WCAG AA ihlali içermez", async ({ page }) => {
  const found: string[] = [];
  await page.goto("/");
  await expect(page.getByLabel("Cep telefonu").locator("visible=true")).toBeVisible();
  found.push(...(await scan(page, "giriş")));

  await demoLogin(page);
  found.push(...(await scan(page, "Yükler")));
  for (const tab of [/Dönüş Planı/, /İlanlarım/, /İşlerim/, /Profil/]) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(800);
    found.push(...(await scan(page, String(tab))));
  }
  for (const [button, label] of [["Belgelerim", "Belgelerim"], ["Hesap ve veriler", "Hesap ve veriler"]] as const) {
    await page.getByRole("tab", { name: /Profil/ }).click();
    await vis(page, button, true).click();
    await page.waitForTimeout(800);
    found.push(...(await scan(page, label)));
    await page.goBack();
  }
  expect(found, found.join("\n")).toEqual([]);
});
