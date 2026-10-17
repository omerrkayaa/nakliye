import json from "./data.json";
import { HeroMapCanvas } from "./hero-map-canvas";
import { COLORS, project, type HeroMapData } from "./projection";

const data = json as HeroMapData;

// SVG yedeği (kuşbakışı): 3B yüklenene kadar ve WebGL yoksa görünür. Sunucuda çizilir; ilçe noktaları yok (HTML hafif kalsın).
const xy = (lon: number, lat: number) => {
  const [x, y] = project(lon, lat);
  return [x, -y] as const;
};
const all = data.outline.flat().map(([lon, lat]) => xy(lon, lat));
const PAD = 0.6;
const [minX, maxX] = [Math.min(...all.map((p) => p[0])) - PAD, Math.max(...all.map((p) => p[0])) + PAD];
const [minY, maxY] = [Math.min(...all.map((p) => p[1])) - PAD, Math.max(...all.map((p) => p[1])) + PAD];
const f = (n: number) => n.toFixed(3);
const line = (pts: [number, number][]) => pts.map(([lon, lat], i) => `${i ? "L" : "M"}${xy(lon, lat).map(f).join(" ")}`).join("");

const LEGEND = [
  [COLORS.confirmed, "Teyitli ilan"],
  [COLORS.pending, "Teyit bekliyor"],
  [COLORS.expired, "Teyit gelmedi, listeden düştü"],
  [COLORS.accent, "Araç bulundu, ilan kapandı"],
] as const;

/** Tanıtım sayfasının 3B haritası: canlı ilan teyidi ve gerçek güzergâhlar. Süs niteliğinde; bilgi metinde ve açıklamada da var. */
export function HeroMap() {
  return (
    <figure className="space-y-3">
      <div className="relative aspect-[2/1] overflow-hidden lg:aspect-[5/2] rounded-2xl border bg-gradient-to-b from-(--map-sky) to-background">
        <HeroMapCanvas
          fallback={
            <svg viewBox={`${f(minX)} ${f(minY)} ${f(maxX - minX)} ${f(maxY - minY)}`} className="size-full">
              <path d={data.outline.map((r) => `${line(r)}Z`).join("")} fill="var(--map-land)" stroke="var(--map-line)" strokeWidth={0.06} strokeLinejoin="round" />
              {data.routes.map((r) => (
                <path key={`${r.from}-${r.to}`} d={line(r.points)} fill="none" stroke="var(--map-line)" strokeOpacity={0.5} strokeWidth={0.035} strokeLinecap="round" />
              ))}
              {data.hubs.map((h) => {
                const [x, y] = xy(h.lon, h.lat);
                return <circle key={h.slug} cx={f(x)} cy={f(y)} r={0.07} fill="var(--map-line)" />;
              })}
            </svg>
          }
        />
      </div>
      <figcaption className="space-y-1.5 text-xs text-muted-foreground">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {LEGEND.map(([color, text]) => (
            <li key={text} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
              {text}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-4 rounded-sm" style={{ background: `linear-gradient(90deg, var(--map-line) 62%, ${COLORS.accent} 62%)` }} />
            Tır, gerçek karayolu güzergâhında
          </li>
        </ul>
        <p>
          İğneler canlı ilan teyidini anlatan temsilî bir canlandırmadır, gerçek ilanlar değildir. Yollar gerçek karayolu güzergâhlarıdır;
          bir yola tıklayınca ya da dokununca o güzergâhın sayfası açılır. Harita verisi: © OpenStreetMap katkıcıları, Natural Earth.
        </p>
      </figcaption>
    </figure>
  );
}
