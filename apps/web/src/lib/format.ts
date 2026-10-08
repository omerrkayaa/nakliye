// Ekranda gösterim biçimleri (tr-TR). Gün değerleri "YYYY-AA-GG" (Türkiye günü), zamanlar ISO.

const dayFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const money = new Intl.NumberFormat("tr-TR");

export const dayText = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

/** "9 Eki" ya da "9 Eki – 11 Eki" */
export const dayRange = (from: string, to: string) => (from === to ? dayText(from) : `${dayText(from)} – ${dayText(to)}`);

export const place = (p: { district: string; province: string }) => `${p.district}, ${p.province}`;

export const tl = (n: number) => `${money.format(n)} ₺`;

/** "az önce", "12 dk önce", "3 sa önce", "2 gün önce" */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}
