import { onRouteMatch, RETURN_PLAN_PARAMS, type LatLng } from "@nakliye/shared";
import json from "@/components/hero-map/data.json";
import { project, type HeroMapData } from "@/components/hero-map/projection";
import { ReturnPlanAnimation, type DemoLoad, type Pt } from "./return-plan-animation";

// Sunucuda hesaplanır: istemciye yalnız birkaç yol dizgesi ve nokta gider (harita verisinin tamamı değil).
const data = json as HeroMapData;
const route = data.routes.find((r) => r.from === "aydin" && r.to === "istanbul")!;

const xy = ([lon, lat]: [number, number]): Pt => {
  const [x, y] = project(lon, lat);
  return [x, -y];
};
const f = (n: number) => n.toFixed(3);

// Görünen bölge: Ege ve Marmara (Aydın–İstanbul hattı)
const [minX, minY] = xy([26.45, 41.3]);
const [maxX, maxY] = xy([30.15, 37.6]);
const viewBox = `${f(minX)} ${f(minY)} ${f(maxX - minX)} ${f(maxY - minY)}`;

const routePts = route.points.map(xy);
const routePath = routePts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("");
const landPath = data.outline.map((ring) => ring.map((p, i) => `${i ? "L" : "M"}${xy(p).map(f).join(" ")}`).join("") + "Z").join("");

/** Noktanın güzergâh çizgisi üstündeki yeri (0 = Aydın, 1 = İstanbul), çizim birimlerinde: tır tam iğnenin yanında durur */
function along(p: Pt): number {
  const seg = routePts.slice(1).map((b, i) => Math.hypot(b[0] - routePts[i]![0], b[1] - routePts[i]![1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let best = { d: Infinity, at: 0 };
  let before = 0;
  seg.forEach((len, i) => {
    const a = routePts[i]!, b = routePts[i + 1]!;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len || 1)));
    const d = Math.hypot(a[0] + t * (b[0] - a[0]) - p[0], a[1] + t * (b[1] - a[1]) - p[1]);
    if (d < best.d) best = { d, at: before + t * len };
    before += len;
  });
  return best.at / total;
}

const PLACES = {
  aydin: { name: "Aydın", lon: 27.84, lat: 37.85 },
  istanbul: { name: "İstanbul", lon: 28.96, lat: 41.01 },
  gebze: { name: "Gebze", lon: 29.43, lat: 40.8 },
  manisa: { name: "Manisa", lon: 27.43, lat: 38.61 },
  bursa: { name: "Bursa", lon: 29.06, lat: 40.19 },
  izmir: { name: "İzmir", lon: 27.14, lat: 38.42 },
  ankara: { name: "Ankara", lon: 32.85, lat: 39.93 },
} as const;
type Place = keyof typeof PLACES;
const ll = (k: Place): LatLng => ({ lat: PLACES[k].lat, lng: PLACES[k].lon });

// Dönüş rotası: İstanbul → Aydın (gidişin tersi). Örnek ilanlar uygulamadaki kuralla (BR-23, onRouteMatch) süzülür.
const returnRoute = [...route.points].reverse().map(([lon, lat]) => ({ lat, lng: lon }));
const REASONS = { kalkis_rotadan_uzak: "kalkışı rotadan uzak", varis_rotadan_uzak: "varışı rotadan uzak", ters_yon: "ters yönde" } as const;
const SAMPLES: [Place, Place, string][] = [
  ["gebze", "manisa", "22 ton · genel kargo"],
  ["bursa", "ankara", "15 ton · palet"],
  ["izmir", "istanbul", "18 ton · gıda"],
];
const loads: DemoLoad[] = SAMPLES.map(([from, to, what]) => {
  const m = onRouteMatch({ origin: ll(from), dest: ll(to) }, returnRoute);
  return {
    title: `${PLACES[from].name} → ${PLACES[to].name}`,
    what,
    from: xy([PLACES[from].lon, PLACES[from].lat]),
    match: m.candidate,
    note: m.candidate ? `Kalkış rotadan ${Math.round(m.originDevKm)} km, varış ${Math.round(m.destDevKm)} km sapıyor` : `Elendi: ${REASONS[m.reason]}`,
  };
});

// Tırın aldığı yük: kurala uyan örnek (ilki)
const [pickFrom, pickTo] = SAMPLES[loads.findIndex((l) => l.match)]!;

/** Tanıtım sayfası: Dönüş Planı (F4) canlandırması. Gerçek karayolu geometrisi, uygulamadaki rota üstü kuralı; ilanlar örnektir. */
export function ReturnPlanSection() {
  const pin = (k: Place) => ({ name: PLACES[k].name, at: xy([PLACES[k].lon, PLACES[k].lat]) });
  return (
    <section id="donus-plani" aria-labelledby="donus-baslik" className="border-y bg-muted/30">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-14">
        <div className="max-w-2xl space-y-2">
          {/* Açık zeminde turuncu yazı AA kontrastı tutturmuyor (axe): açıkta koyu turuncu */}
          <p className="text-sm font-semibold text-orange-700 dark:text-brand-accent">Nakliyeciler için</p>
          <h2 id="donus-baslik" className="text-2xl font-bold">
            Gidiş dolu, dönüş de dolu
          </h2>
          <p className="text-muted-foreground">
            İş sürerken Dönüş Planı, eve dönüş yolunuzun üstündeki teyitli yükleri bulur: kalkışı ve varışı rotadan en çok{" "}
            {RETURN_PLAN_PARAMS.routeMaxDeviationKm} km sapan ve sizin yönünüzde giden yükler.
          </p>
        </div>
        <ReturnPlanAnimation
          viewBox={viewBox}
          landPath={landPath}
          routePath={routePath}
          corridorWidth={(RETURN_PLAN_PARAMS.routeMaxDeviationKm / 111) * 0.68 * 2}
          places={{ home: pin("aydin"), delivery: pin("istanbul"), pickup: pin(pickFrom), drop: pin(pickTo), other: [pin("bursa"), pin("izmir")] }}
          stops={{ pickup: along(pin(pickFrom).at), drop: along(pin(pickTo).at) }}
          loads={loads}
        />
        <p className="text-xs text-muted-foreground">
          Temsilî canlandırma: güzergâh gerçek karayolu geometrisidir (OpenStreetMap), ilanlar örnektir; sapma mesafeleri uygulamadaki kuralla
          hesaplanmıştır.
        </p>
      </div>
    </section>
  );
}
