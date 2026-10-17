import { VEHICLE_TYPES } from "@nakliye/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tl } from "@/lib/format";
import type { RouteSummary } from "@/lib/types";

/** F7 tahmini taşıma ücreti tablosu (güzergâh sayfaları ve fiyat hesaplayıcı) ve neye dayandığının açıklaması. */
export function PriceTable({ summary: s }: { summary: RouteSummary }) {
  return (
    <>
      <Table data-testid="price-table">
        <TableHeader>
          <TableRow>
            <TableHead>Araç</TableHead>
            <TableHead className="text-right">Tahmini aralık</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {s.estimates.map((e) => (
            <TableRow key={e.vehicleType}>
              <TableCell>{VEHICLE_TYPES[e.vehicleType]}</TableCell>
              <TableCell className="text-right tabular-nums">
                {tl(e.min)} – {tl(e.max)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        {s.source === "karayolu" ? "Karayolu" : "Yaklaşık"} {s.distanceKm} km (il merkezleri arası). Yakıt, şoför ve araç gideri üzerinden hesaplanır; otoyol/köprü
        ücreti dahil değildir. Gerçek fiyat yüke, tarihe ve yükleme yerine göre değişir.
      </p>
    </>
  );
}
