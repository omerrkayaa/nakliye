"use client";

import type { BodyType, VehicleType } from "@nakliye/shared";
import { useEffect, useRef, useState } from "react";
import { onThemeChange } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { DEFAULT_BODY } from "./catalog";
import type { VehicleScene } from "./scene";

/** WebGL yoksa gösterilen resim (mobilde de kullanılan, scripts/render-vehicles.mjs ile aynı modellerden çıkarılan) */
export const vehicleImage = (vehicle: VehicleType, body: BodyType) =>
  body === DEFAULT_BODY[vehicle] || vehicle === "panelvan" ? `/arac/${vehicle}.png` : `/arac/kasa-${body}.png`;

/**
 * Tek aracın döndürülebilir 3B görüntüsü. three.js ayrı parçadır, bileşen ekrana gelince yüklenir; ekranda değilken çizim durur,
 * "hareketi azalt" tercihinde salınım yok. WebGL yoksa ya da bağlam düşerse resim kalır.
 */
export function VehicleViewer({ vehicle, body, className }: { vehicle: VehicleType; body: BodyType; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<VehicleScene | null>(null);
  const [state, setState] = useState<"bekliyor" | "hazir" | "yok">("bekliyor");
  const want = useRef({ vehicle, body }); // sahne sonradan yüklenince ilk gösterilecek seçim

  useEffect(() => {
    const el = host.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    let visible = false;
    let started = false;
    const sync = () => scene.current?.setActive(visible && !document.hidden);
    const fail = () => {
      scene.current?.dispose();
      scene.current = null;
      setState("yok");
    };
    const start = () =>
      import("./scene")
        .then((m) => {
          if (cancelled) return;
          try {
            scene.current = m.createVehicleScene({ canvas: cv, host: el, reducedMotion: reduced, drag: true, onError: fail });
            scene.current.show(want.current.vehicle, want.current.body);
            setState("hazir");
            sync();
          } catch {
            fail(); // WebGL bağlamı kurulamadı
          }
        })
        .catch(fail);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !started) {
        started = true;
        void start();
      }
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    const stopTheme = onThemeChange(() => scene.current?.applyTheme());
    return () => {
      cancelled = true;
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      stopTheme();
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    want.current = { vehicle, body };
    scene.current?.show(vehicle, body);
  }, [vehicle, body]);

  return (
    <div ref={host} data-vehicle-viewer={state} className={cn("relative aspect-[16/9] w-full", className)}>
      {state !== "hazir" && (
        // eslint-disable-next-line @next/next/no-img-element -- küçük, sabit boyutlu yedek resim
        <img src={vehicleImage(vehicle, body)} alt="" aria-hidden className="absolute inset-0 size-full object-contain" />
      )}
      <canvas
        ref={canvas}
        aria-hidden
        className={cn("absolute inset-0 size-full cursor-grab touch-pan-y opacity-0 transition-opacity duration-500 active:cursor-grabbing", state === "hazir" && "opacity-100")}
      />
    </div>
  );
}
