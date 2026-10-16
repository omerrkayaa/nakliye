"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { HeroMapData } from "./projection";
import type { HeroScene } from "./scene";

/**
 * 3B sahneyi ana içerik çizildikten sonra (boşta) yükler; three.js ayrı parçadır, ilk yüklemeye girmez.
 * Ekranda değilken ya da sekme gizliyken çizim durur; "hareketi azalt" tercihinde tek kare çizilir.
 * WebGL yoksa ya da bağlam düşerse sunucuda çizilmiş SVG harita (fallback) kalır.
 */
export function HeroMapCanvas({ fallback }: { fallback: ReactNode }) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"bekliyor" | "hazir" | "yok">("bekliyor");
  const [motion, setMotion] = useState<"tam" | "azaltilmis" | null>(null);

  useEffect(() => {
    const el = host.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const input = window.matchMedia("(pointer: fine)").matches ? "drag" : "tap";
    let scene: HeroScene | null = null;
    let cancelled = false;
    let visible = false;
    const sync = () => scene?.setActive(visible && !document.hidden);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);

    const fail = () => {
      scene?.dispose();
      scene = null;
      setState("yok");
    };
    const start = () =>
      Promise.all([import("./scene"), import("./data.json")])
        .then(([m, d]) => {
          if (cancelled) return;
          try {
            scene = m.createScene({
              canvas: cv,
              host: el,
              data: d.default as HeroMapData,
              reducedMotion: reduced,
              input,
              onNavigate: (path) => router.push(path),
              onReady: () => {
                setMotion(reduced ? "azaltilmis" : "tam");
                setState("hazir");
              },
              onError: fail,
            });
            sync();
          } catch {
            fail(); // WebGL bağlamı kurulamadı
          }
        })
        .catch(fail);
    const ric = typeof window.requestIdleCallback === "function"; // Safari'de yok
    const idle = ric ? window.requestIdleCallback(start, { timeout: 2500 }) : window.setTimeout(start, 600);

    return () => {
      cancelled = true;
      if (ric) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      scene?.dispose();
    };
  }, [router]);

  return (
    <>
      <div aria-hidden className={cn("absolute inset-0 transition-opacity duration-700", state === "hazir" && "opacity-0")}>
        {fallback}
      </div>
      <div ref={host} aria-hidden data-hero-map={state} data-motion={motion ?? undefined} className="absolute inset-0">
        <canvas ref={canvas} aria-hidden className={cn("absolute inset-0 size-full touch-pan-y opacity-0 transition-opacity duration-700", state === "hazir" && "opacity-100")} />
      </div>
    </>
  );
}
