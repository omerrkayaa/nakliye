// W2 güzergâh sayfaları: başlangıç koridorunun illeri (docs/03 §1: Aydın–İzmir–Manisa–İstanbul) ve büyük yük merkezleri
// (karar 2026-10-12) arasında, her il çifti için iki yön.
// Adres /nakliye/<il>-<il>; kimlik plaka kodu (API GET /public/routes/:from/:to).
export const PROVINCES = [
  { slug: "aydin", id: 9, name: "Aydın" },
  { slug: "izmir", id: 35, name: "İzmir" },
  { slug: "manisa", id: 45, name: "Manisa" },
  { slug: "istanbul", id: 34, name: "İstanbul" },
  { slug: "ankara", id: 6, name: "Ankara" },
  { slug: "bursa", id: 16, name: "Bursa" },
  { slug: "kocaeli", id: 41, name: "Kocaeli" },
  { slug: "konya", id: 42, name: "Konya" },
  { slug: "mersin", id: 33, name: "Mersin" },
] as const;

export const ROUTE_PAGES = PROVINCES.flatMap((from) =>
  PROVINCES.filter((to) => to !== from).map((to) => ({ slug: `${from.slug}-${to.slug}`, path: `/nakliye/${from.slug}-${to.slug}`, from, to })),
);

export type RoutePage = (typeof ROUTE_PAGES)[number];

export const routePage = (slug: string) => ROUTE_PAGES.find((r) => r.slug === slug);
