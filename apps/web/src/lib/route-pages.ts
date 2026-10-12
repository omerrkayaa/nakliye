// W2 güzergâh sayfaları: başlangıç koridorunun illeri arasında her iki yön (docs/03 §1: Aydın–İzmir–Manisa–İstanbul).
// Adres /nakliye/<il>-<il>; kimlik plaka kodu (API GET /public/routes/:from/:to).
const PROVINCES = [
  { slug: "aydin", id: 9, name: "Aydın" },
  { slug: "izmir", id: 35, name: "İzmir" },
  { slug: "manisa", id: 45, name: "Manisa" },
  { slug: "istanbul", id: 34, name: "İstanbul" },
] as const;

export const ROUTE_PAGES = PROVINCES.flatMap((from) =>
  PROVINCES.filter((to) => to !== from).map((to) => ({ slug: `${from.slug}-${to.slug}`, path: `/nakliye/${from.slug}-${to.slug}`, from, to })),
);

export type RoutePage = (typeof ROUTE_PAGES)[number];

export const routePage = (slug: string) => ROUTE_PAGES.find((r) => r.slug === slug);
