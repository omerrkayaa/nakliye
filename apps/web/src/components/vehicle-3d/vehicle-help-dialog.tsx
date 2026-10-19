"use client";

import type { BodyType, VehicleType } from "@nakliye/shared";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VehicleExplorer } from "./vehicle-explorer";

/**
 * İlan formunda "Hangisi?": araç ve kasa tiplerini 3B görüp seçmek için pencere. Görüntüleyici (ve three.js) yalnız pencere açılınca yüklenir.
 */
export function VehicleHelpDialog({
  vehicle,
  body,
  onPick,
}: {
  vehicle: VehicleType | null;
  body: BodyType | null;
  /** body null: kasa "Farketmez" kalır */
  onPick: (vehicle: VehicleType, body: BodyType | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => ref.current?.close();
  const pick = (v: VehicleType, b: BodyType | null) => {
    onPick(v, b);
    close();
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
      >
        Hangisi? Araç ve kasa tiplerini görün
      </Button>
      <dialog
        ref={ref}
        aria-labelledby="arac-yardim-baslik"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && close()} // arka plana tıklayınca kapanır
        className="m-auto w-[min(100%-2rem,48rem)] rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="max-h-[90dvh] space-y-4 overflow-y-auto p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="arac-yardim-baslik" className="text-lg font-semibold">
              Araç ve kasa tipleri
            </h2>
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Kapat
            </Button>
          </div>
          {open && (
            <VehicleExplorer
              initialVehicle={vehicle ?? "tir"}
              initialBody={body}
              footer={(s) => (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => pick(s.vehicle, null)}>
                    Yalnız araç tipini seç
                  </Button>
                  <Button type="button" onClick={() => pick(s.vehicle, s.body)}>
                    Araç ve kasayı seç
                  </Button>
                </div>
              )}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
