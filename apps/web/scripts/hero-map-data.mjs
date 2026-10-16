// Tanıtım sayfasındaki 3B haritanın verisi → src/components/hero-map/data.json (repoya commit'lenir; nadiren yeniden üretilir).
//
// Kaynaklar (hepsi ücretsiz):
// - Türkiye kıyı/sınır çizgisi: Natural Earth 1:50m (kamu malı), world-atlas@2.0.2 paketindeki TopoJSON (jsDelivr).
// - İlçe noktaları: apps/api/src/db/seed/locations.json (OSM, ODbL; il/ilçe veri setimiz).
// - Güzergâhlar: kendi OSRM sunucumuz (OSRM_URL, varsayılan http://localhost:5000; infra/osrm.md) — gerçek karayolu geometrisi.
//
// Çalıştırma (apps/web içinden; OSRM açık olmalı): node scripts/hero-map-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

const OSRM = process.env.OSRM_URL ?? "http://localhost:5000";
const TOPO = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json";
const OUT = new URL("../src/components/hero-map/data.json", import.meta.url);
const locations = JSON.parse(readFileSync(new URL("../../api/src/db/seed/locations.json", import.meta.url), "utf8"));

// Güzergâh sayfalarının illeri (src/lib/route-pages.ts) ve sahnede tırların gittiği çiftler (/nakliye/<a>-<b> sayfası var)
const HUBS = { aydin: 9, izmir: 35, manisa: 45, istanbul: 34, ankara: 6, bursa: 16, kocaeli: 41, konya: 42, mersin: 33 };
const ROUTES = [
  ["izmir", "ankara"],
  ["aydin", "istanbul"],
  ["istanbul", "ankara"],
  ["konya", "mersin"],
  ["bursa", "konya"],
  ["manisa", "kocaeli"],
];

const r3 = (n) => Math.round(n * 1000) / 1000;

/** Douglas–Peucker (derece cinsinden düzlemsel; bu ölçekte yeterli) */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1e-9;
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > max) [max, idx] = [d, i];
  }
  if (max <= tol) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

/** Kapalı halka: uçlar aynı nokta olduğu için ilk noktaya en uzak noktadan ikiye bölünüp parçalar ayrı sadeleştirilir */
function simplifyRing(ring, tol) {
  const open = ring.slice(0, -1);
  let far = 0;
  open.forEach(([x, y], i) => { if (Math.hypot(x - open[0][0], y - open[0][1]) > Math.hypot(open[far][0] - open[0][0], open[far][1] - open[0][1])) far = i; });
  return [...simplify(open.slice(0, far + 1), tol).slice(0, -1), ...simplify([...open.slice(far), open[0]], tol)];
}

/** Halka alanı (derece², işaretsiz) — küçük adaları elemek için */
const area = (ring) => Math.abs(ring.reduce((s, [x, y], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + x * y2 - x2 * y; }, 0)) / 2;

async function turkeyOutline() {
  const topo = await (await fetch(TOPO)).json();
  const { scale, translate } = topo.transform;
  // TopoJSON yayları fark kodlu ve nicemlenmiş
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => [(x += dx) * scale[0] + translate[0], (y += dy) * scale[1] + translate[1]]);
  });
  const ringOf = (ids) => ids.flatMap((i, k) => {
    const a = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
    return k === 0 ? a : a.slice(1);
  });
  const geom = topo.objects.countries.geometries.find((g) => g.id === "792");
  if (!geom) throw new Error("Türkiye (792) bulunamadı");
  const polys = geom.type === "Polygon" ? [geom.arcs] : geom.arcs;
  // Yalnız dış halkalar; 0,02 derece²'den küçük adalar sahnede görünmez
  return polys
    .map((p) => ringOf(p[0]))
    .filter((ring) => area(ring) > 0.02)
    .map((ring) => simplifyRing(ring, 0.015).map(([x, y]) => [r3(x), r3(y)]));
}

async function road(from, to) {
  const url = `${OSRM}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const j = await res.json();
  if (j.code !== "Ok") throw new Error(`OSRM ${j.code}: ${from.name} → ${to.name}`);
  return { km: Math.round(j.routes[0].distance / 1000), points: simplify(j.routes[0].geometry.coordinates, 0.01).map(([x, y]) => [r3(x), r3(y)]) };
}

const province = (id) => locations.provinces.find((p) => p.id === id);

const outline = await turkeyOutline();
const hubs = Object.entries(HUBS).map(([slug, id]) => { const p = province(id); return { slug, name: p.name, lon: r3(p.lon), lat: r3(p.lat) }; });
const routes = [];
for (const [a, b] of ROUTES) {
  const r = await road(province(HUBS[a]), province(HUBS[b]));
  routes.push({ from: a, to: b, ...r });
}
const districts = locations.districts.map((d) => [r3(d.lon), r3(d.lat)]);

writeFileSync(OUT, JSON.stringify({
  source: "Natural Earth 1:50m (kamu malı) · OSM il/ilçe noktaları (ODbL, © OpenStreetMap katkıcıları) · güzergâhlar OSRM (OSM verisi)",
  outline,
  hubs,
  routes,
  districts,
}) + "\n");
console.log(`kıyı: ${outline.length} halka, ${outline.reduce((n, r) => n + r.length, 0)} nokta · ilçe: ${districts.length} · güzergâh: ${routes.map((r) => `${r.from}-${r.to} ${r.km} km/${r.points.length} nokta`).join(", ")}`);
