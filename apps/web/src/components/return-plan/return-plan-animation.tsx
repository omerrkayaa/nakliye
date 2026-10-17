"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CircleCheck, CircleX, Pause, Play } from "lucide-react";
import { cn } from "cn";

export type Pt = [number, number];
export interface DemoLoad {
  title: string;
  what: string;
  from: Pt;
  match: boolean;
  note: string;
}
interface Pin {
  name: string;
  at: Pt;
}
interface Props {
  viewBox: string;
  landPath: string;
  routePath: string;
  /** Rota üstü koridorunun çizim birimlerinde genişliği (iki yana sapma sınırı) */
  corridorWidth: number;
  places: { home: Pin; delivery: Pin; pickup: Pin; drop: Pin; other: Pin[] };
  /** Güzergâh üstündeki yer (0 = ev, 1 = teslim) */
  stops: { pickup: number; drop: number };
  loads: DemoLoad[];
}

/** Zaman çizelgesi parçası: tır `from`→`to` (güzergâh üstü yer) gider ya da bekler; `step` alttaki anlatımın sırası */
interface Seg {
  dur: number;
  from: number;
  to: number;
  loaded: boolean;
  step: number;
}

const SPEED = 0.13; // güzergâh / sn
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/**
 * Dönüş Planı canlandırması: tır gidişte dolu, yoldayken dönüş koridoru ve uyan/elenen ilanlar belirir, teslimden sonra
 * rotadaki yükü alıp dolu döner. Çizim her karede DOM'a doğrudan yazılır (React yalnız adım değişince çizer).
 * Hareketi azalt tercihinde kendiliğinden oynamaz; adımlara tıklanınca o adımın son hâli gösterilir.
 */
export function ReturnPlanAnimation({ viewBox, landPath, routePath, corridorWidth, places, stops, loads }: Props) {
  const { pickup, drop } = stops;
  const steps = useMemo(
    () => [
      `${places.home.name}'dan ${places.delivery.name}'a yüklü yola çıktı.`,
      `Yoldayken Dönüş Planı, dönüş yolunun üstündeki teyitli yükleri bulur; rotaya uymayanları eler.`,
      `${places.delivery.name}'da teslim kodu girildi. ${places.pickup.name}'deki yüke teklif verildi, kabul edildi.`,
      `${places.pickup.name}'den ${places.drop.name}'ya dolu döndü; eve yalnız kısa bir yol boş kaldı.`,
    ],
    [places],
  );
  const timeline = useMemo<Seg[]>(() => {
    const drive = (from: number, to: number, loaded: boolean, step: number): Seg => ({ dur: Math.abs(to - from) / SPEED, from, to, loaded, step });
    const wait = (at: number, dur: number, loaded: boolean, step: number): Seg => ({ dur, from: at, to: at, loaded, step });
    return [
      drive(0, 0.5, true, 0),
      drive(0.5, 1, true, 1),
      wait(1, 1.4, false, 2),
      drive(1, pickup, false, 2),
      wait(pickup, 0.9, true, 2),
      drive(pickup, drop, true, 3),
      wait(drop, 0.9, false, 3),
      drive(drop, 0, false, 3),
      wait(0, 2.5, false, 3),
    ];
  }, [pickup, drop]);
  const starts = useMemo(() => timeline.reduce<number[]>((acc, s, i) => [...acc, i ? acc[i - 1]! + timeline[i - 1]!.dur : 0], []), [timeline]);
  const total = starts.at(-1)! + timeline.at(-1)!.dur;
  // Koridor ve ilanlar 2. adımın başından biraz sonra belirir
  const revealAt = starts[1]! + 0.6;
  /** Adımın son anı (hareketi azaltılmış gösterim ve adıma atlama için) */
  const stepEnd = useCallback(
    (step: number) => {
      const last = timeline.findLastIndex((s) => s.step === step);
      return starts[last]! + timeline[last]!.dur - 0.001;
    },
    [timeline, starts],
  );

  const route = useRef<SVGPathElement>(null);
  const truck = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const cargo = useRef<SVGRectElement>(null);
  const badge = useRef<SVGTextElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const clock = useRef(0);
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0); // görünen ilan sayısı
  const [playing, setPlaying] = useState(false);
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);

  // t anındaki kareyi çiz
  const draw = useCallback(
    (t: number) => {
      const path = route.current;
      if (!path) return;
      let i = starts.findLastIndex((s) => s <= t);
      if (i < 0) i = 0;
      const seg = timeline[i]!;
      const k = seg.dur ? ease(Math.min(1, (t - starts[i]!) / seg.dur)) : 1;
      const at = seg.from + (seg.to - seg.from) * k;
      const len = path.getTotalLength();
      const p = path.getPointAtLength(at * len);
      const q = path.getPointAtLength(Math.min(len, at * len + 0.01));
      const back = path.getPointAtLength(Math.max(0, at * len - 0.01));
      let angle = (Math.atan2(q.y - back.y, q.x - back.x) * 180) / Math.PI;
      if (seg.to < seg.from || (seg.to === seg.from && i > 1)) angle += 180; // dönüşte (ve dönüşteki beklemelerde) burun eve doğru
      truck.current?.setAttribute("transform", `translate(${p.x} ${p.y})`);
      body.current?.setAttribute("transform", `rotate(${angle}) scale(1.5)`);
      cargo.current?.setAttribute("opacity", seg.loaded ? "1" : "0");
      if (badge.current) badge.current.textContent = seg.loaded ? "DOLU" : "BOŞ";
      setStep(seg.step);
      setShown(t < revealAt ? 0 : Math.min(loads.length, 1 + Math.floor((t - revealAt) / 0.5)));
    },
    [starts, timeline, revealAt, loads.length],
  );

  // İlk kare; hareketi azaltılmışsa 2. adımın son hâli (koridor ve ilanlar görünür), değilse ekrana girince oynar
  useEffect(() => {
    clock.current = reduced ? stepEnd(1) : 0;
    draw(clock.current);
    if (reduced) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        setPlaying(true);
        io.disconnect();
      }
    });
    if (host.current) io.observe(host.current);
    return () => io.disconnect();
  }, [reduced, draw, stepEnd]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
    if (host.current) io.observe(host.current);
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible && !document.hidden) {
        clock.current = (clock.current + dt) % total;
        draw(clock.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [playing, total, draw]);

  const seek = (s: number) => {
    clock.current = reduced || !playing ? stepEnd(s) : starts[timeline.findIndex((x) => x.step === s)]!;
    draw(clock.current);
  };

  const u = corridorWidth / 0.37; // çizim ölçeği (koridor genişliğine göre)
  const revealed = shown > 0;
  const label = (pin: Pin, opts: { dx?: number; dy?: number; anchor?: "start" | "end"; strong?: boolean } = {}) => (
    <text
      x={pin.at[0] + (opts.dx ?? 0.06) * u}
      y={pin.at[1] + (opts.dy ?? 0.025) * u}
      textAnchor={opts.anchor ?? "start"}
      fontSize={0.075 * u}
      fontWeight={opts.strong ? 700 : 500}
      className="fill-foreground"
      style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 0.02 * u, strokeLinejoin: "round" }}
    >
      {pin.name}
    </text>
  );

  return (
    <div ref={host} className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
      <div className="relative overflow-hidden rounded-2xl border bg-(--map-sky)">
        <svg viewBox={viewBox} className="block h-auto w-full" role="img" aria-label="Aydın–İstanbul güzergâhında gidip gelen tırın canlandırması">
          <path d={landPath} fill="var(--map-land)" stroke="var(--map-dot)" strokeWidth={0.008 * u} />
          {/* Rota üstü koridoru: dönüş yolundan iki yana en çok 30 km */}
          <path
            d={routePath}
            fill="none"
            stroke="var(--primary)"
            strokeOpacity={0.18}
            strokeWidth={corridorWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("transition-opacity duration-700", revealed ? "opacity-100" : "opacity-0")}
          />
          <path ref={route} d={routePath} fill="none" stroke="var(--map-line)" strokeWidth={0.018 * u} strokeLinecap="round" strokeLinejoin="round" />

          {/* Ev ve teslim noktası */}
          <circle cx={places.home.at[0]} cy={places.home.at[1]} r={0.03 * u} fill="var(--map-line)" />
          {label({ ...places.home, name: `${places.home.name} (ev)` }, { strong: true })}
          <circle cx={places.delivery.at[0]} cy={places.delivery.at[1]} r={0.03 * u} fill="var(--map-line)" />
          {label({ ...places.delivery, name: `${places.delivery.name} (teslim)` }, { anchor: "end", dx: -0.06, dy: 0.08, strong: true })}

          {/* Örnek ilanlar: uyan yeşil, elenen gri */}
          {loads.map((l, i) => (
            <g key={l.title} className={cn("transition-opacity duration-500", i < shown ? "opacity-100" : "opacity-0")}>
              <circle cx={l.from[0]} cy={l.from[1]} r={0.038 * u} fill={l.match ? "#16a34a" : "#94a3b8"} stroke="var(--background)" strokeWidth={0.012 * u} />
              {!l.match && (
                <path
                  d={`M${l.from[0] - 0.016 * u} ${l.from[1] - 0.016 * u}l${0.032 * u} ${0.032 * u}m0 ${-0.032 * u}l${-0.032 * u} ${0.032 * u}`}
                  stroke="white"
                  strokeWidth={0.01 * u}
                />
              )}
            </g>
          ))}
          {revealed && label(places.pickup, { dx: 0.06, dy: 0.06 })}
          {revealed && <circle cx={places.drop.at[0]} cy={places.drop.at[1]} r={0.024 * u} fill="var(--brand-accent)" />}
          {revealed && label(places.drop, { anchor: "end", dx: -0.06 })}
          {revealed && places.other.map((p) => <g key={p.name}>{label(p, { dx: 0.06, dy: 0.06 })}</g>)}

          {/* Tır: dorse (yük varken turuncu kasa) + çekici; üstünde DOLU/BOŞ */}
          <g ref={truck}>
            <g ref={body} transform="scale(1.5)">
              <rect x={-0.07 * u} y={-0.022 * u} width={0.1 * u} height={0.044 * u} rx={0.006 * u} fill="var(--card)" stroke="var(--map-line)" strokeWidth={0.008 * u} />
              <rect ref={cargo} x={-0.064 * u} y={-0.016 * u} width={0.088 * u} height={0.032 * u} rx={0.004 * u} fill="var(--brand-accent)" />
              <rect x={0.036 * u} y={-0.02 * u} width={0.036 * u} height={0.04 * u} rx={0.008 * u} fill="var(--map-line)" />
            </g>
            <text ref={badge} y={-0.075 * u} textAnchor="middle" fontSize={0.055 * u} fontWeight={700} className="fill-foreground" style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 0.016 * u }}>
              DOLU
            </text>
          </g>
        </svg>
        {!reduced && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Canlandırmayı durdur" : "Canlandırmayı oynat"}
            className="absolute right-3 bottom-3 inline-flex size-10 items-center justify-center rounded-full border bg-background/90 shadow-sm hover:bg-muted"
          >
            {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          </button>
        )}
      </div>

      <div className="space-y-6">
        <ol className="space-y-2">
          {steps.map((text, i) => (
            <li key={text}>
              <button
                type="button"
                onClick={() => seek(i)}
                aria-current={step === i ? "step" : undefined}
                className={cn(
                  "flex w-full gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                  step === i ? "border-primary/50 bg-background shadow-sm" : "border-transparent text-muted-foreground hover:bg-background/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    step === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span>{text}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">
            Dönüş Planı · {places.delivery.name} → {places.home.name}
          </p>
          <ul className="mt-3 space-y-2">
            {loads.map((l, i) => (
              <li
                key={l.title}
                // Yarı saydam geçiş yok: metin her an ya tam görünür ya gizli (kontrast taraması geçiş anını yakalamasın)
                className={cn("flex gap-2.5 rounded-lg p-2 text-sm", i >= shown && "invisible", l.match && "bg-emerald-50 dark:bg-emerald-950/40")}
              >
                {l.match ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
                ) : (
                  <CircleX className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span>
                  <span className={cn("font-medium", !l.match && "text-muted-foreground")}>{l.title}</span>{" "}
                  <span className="text-muted-foreground">· {l.what}</span>
                  <span className="block text-xs text-muted-foreground">{l.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
