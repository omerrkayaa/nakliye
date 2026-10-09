// Ekranda gösterim biçimleri (tr-TR) — apps/web/src/lib/format.ts ile aynı. Gün değerleri "YYYY-AA-GG" (Türkiye günü).

const dayFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const money = new Intl.NumberFormat("tr-TR");

export const dayText = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

/** "9 Eki" ya da "9 Eki – 11 Eki" */
export const dayRange = (from: string, to: string) => (from === to ? dayText(from) : `${dayText(from)} – ${dayText(to)}`);

export const place = (p: { district: string; province: string }) => `${p.district}, ${p.province}`;

/** Boş araç güzergâhı; varış yoksa "her yere giderim" */
export const capacityRoute = (c: { origin: { district: string; province: string }; dest: { district: string; province: string } | null }) =>
  `${place(c.origin)} → ${c.dest ? place(c.dest) : "Her yer"}`;

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

/** "+905551234567" → "0555 123 45 67" (biçim tanınmazsa olduğu gibi) */
/** Kartta güven sinyali: "★ 4,8 (12) · 23 iş", puan yoksa "5 iş · henüz puan yok", hiç iş yoksa "Yeni üye" */
export function reputationText(r: { rating?: number | null; ratingCount?: number; completedJobs?: number }): string | null {
  if (r.completedJobs === undefined) return null;
  const jobs = `${r.completedJobs} iş`;
  if (r.rating !== null && r.rating !== undefined) return `★ ${String(r.rating).replace(".", ",")} (${r.ratingCount ?? 0}) · ${jobs}`;
  return r.completedJobs > 0 ? `${jobs} · henüz puan yok` : "Yeni üye";
}

export function phoneText(p: string): string {
  const m = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(p);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}
