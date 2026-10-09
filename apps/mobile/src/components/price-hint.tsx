import type { VehicleType } from "@nakliye/shared";
import { useEffect, useState } from "react";
import { Muted } from "@/components/ui";
import { api } from "@/lib/api";
import { tl } from "@/lib/format";
import type { PriceEstimate } from "@/lib/types";

/** F7: güzergâh ve araç tipine göre tahmini fiyat aralığı (yaklaşık; otoyol/köprü hariç). Bilgi yoksa hiçbir şey göstermez. */
export function PriceHint({ from, to, vehicleType }: { from?: number | null; to?: number | null; vehicleType?: VehicleType | null }) {
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  useEffect(() => {
    let live = true;
    if (from && to && vehicleType) {
      api<PriceEstimate>(`/price-estimate?from=${from}&to=${to}&vehicleType=${vehicleType}`)
        .then((e) => live && setEstimate(e))
        .catch(() => live && setEstimate(null));
    }
    return () => {
      live = false;
    };
  }, [from, to, vehicleType]);
  if (!from || !to || !vehicleType || !estimate) return null;
  return (
    <Muted>
      Tahmini piyasa aralığı: {tl(estimate.min)} – {tl(estimate.max)} (yaklaşık {estimate.distanceKm} km; otoyol/köprü hariç)
    </Muted>
  );
}
