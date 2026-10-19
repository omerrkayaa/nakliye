"use client";

import { BODY_TYPE_INFO, BODY_TYPES, VEHICLE_TYPE_INFO, VEHICLE_TYPES, type BodyType, type VehicleType } from "@nakliye/shared";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_BODY, isUncommon } from "./catalog";
import { VehicleViewer } from "./vehicle-viewer";

const chip = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
  );

/** Araç ve kasa tipi seçilir; 3B görüntü ve açıklama birlikte değişir. Rehberde ve ilan formundaki "Hangisi?" penceresinde kullanılır. */
export function VehicleExplorer({
  initialVehicle = "tir",
  initialBody,
  footer,
}: {
  initialVehicle?: VehicleType;
  initialBody?: BodyType | null;
  /** Seçimle bir şey yapmak için (ör. formda "Bunu seç") */
  footer?: (sel: { vehicle: VehicleType; body: BodyType }) => React.ReactNode;
}) {
  const id = useId();
  const [vehicle, setVehicle] = useState<VehicleType>(initialVehicle);
  const [body, setBody] = useState<BodyType>(initialBody ?? DEFAULT_BODY[initialVehicle]);
  const pickVehicle = (v: VehicleType) => {
    setVehicle(v);
    if (isUncommon(v, body)) setBody(DEFAULT_BODY[v]);
  };
  const uncommon = isUncommon(vehicle, body);

  return (
    <div className="space-y-4" data-vehicle-explorer>
      <div className="overflow-hidden rounded-xl border bg-[var(--map-sky)]">
        <VehicleViewer vehicle={vehicle} body={body} />
      </div>
      <div className="space-y-2">
        <p id={`${id}-v`} className="text-sm font-semibold">
          Araç tipi
        </p>
        <div role="group" aria-labelledby={`${id}-v`} className="flex flex-wrap gap-2">
          {(Object.keys(VEHICLE_TYPES) as VehicleType[]).map((v) => (
            <button key={v} type="button" aria-pressed={vehicle === v} className={chip(vehicle === v)} onClick={() => pickVehicle(v)}>
              {VEHICLE_TYPES[v]}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p id={`${id}-b`} className="text-sm font-semibold">
          Kasa tipi
        </p>
        <div role="group" aria-labelledby={`${id}-b`} className="flex flex-wrap gap-2">
          {(Object.keys(BODY_TYPES) as BodyType[]).map((b) => (
            <button key={b} type="button" aria-pressed={body === b} className={chip(body === b)} onClick={() => setBody(b)}>
              {BODY_TYPES[b]}
            </button>
          ))}
        </div>
      </div>
      <div aria-live="polite" className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
        <p>
          <strong>{VEHICLE_TYPES[vehicle]}:</strong> {VEHICLE_TYPE_INFO[vehicle]}
        </p>
        <p>
          <strong>{BODY_TYPES[body]}:</strong> {BODY_TYPE_INFO[body]}
        </p>
        {uncommon && (
          <p className="text-muted-foreground">
            {VEHICLE_TYPES[vehicle]} için {BODY_TYPES[body].toLocaleLowerCase("tr-TR")} yaygın değil
            {vehicle === "panelvan" ? "; görselde kapalı kasa gösteriliyor." : "."}
          </p>
        )}
      </div>
      {footer?.({ vehicle, body })}
    </div>
  );
}
