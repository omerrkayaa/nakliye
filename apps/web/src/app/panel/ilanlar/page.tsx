import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CARGO_TYPES, VEHICLE_TYPES, VISIBLE_LOAD_STATUSES } from "@nakliye/shared";
import { FileSpreadsheet, Plus } from "lucide-react";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { ago, dayRange, place, tl } from "@/lib/format";
import type { LoadItem, Me, Page } from "@/lib/types";
import { BecomeShipper } from "../become-shipper";
import { BulkConfirm } from "./bulk-confirm";
import { ConfirmButton } from "./confirm-button";

const BULK_FORM = "toplu-teyit";

export const metadata: Metadata = { title: "İlanlarım" };

/** P4 İlanlarım: durum, son teyit, bekleyen teklif, "hâlâ geçerli" (tek tek ya da toplu). Kapatma ilan sayfasında. */
export default function LoadsPage({ searchParams }: PageProps<"/panel/ilanlar">) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">İlanlarım</h1>
          <p className="text-muted-foreground">Yayındaki ilanlar düzenli olarak size teyit ettirilir; cevapsız kalan ilan listeden düşer.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/panel/ilanlar/toplu" className={buttonVariants({ variant: "outline", className: "h-11 px-5" })}>
            <FileSpreadsheet aria-hidden /> Excel ile toplu ilan
          </Link>
          <Link href="/panel/ilanlar/yeni" className={buttonVariants({ className: "h-11 px-5" })}>
            <Plus aria-hidden /> Yeni ilan
          </Link>
        </div>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
        <Loads searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Loads({ searchParams }: Pick<PageProps<"/panel/ilanlar">, "searchParams">) {
  const me = await api<Me>("/me");
  if (!me.roles.includes("shipper")) return <BecomeShipper />;

  const raw = (await searchParams).sayfa;
  const page = Math.max(1, Number(typeof raw === "string" ? raw : 1) || 1);
  const data = await api<Page<LoadItem>>(`/loads/mine?page=${page}`);
  if (data.items.length === 0 && page === 1) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        Henüz ilanınız yok.{" "}
        <Link href="/panel/ilanlar/yeni" className="font-medium text-primary underline-offset-4 hover:underline">
          İlk ilanınızı verin
        </Link>
      </p>
    );
  }

  const visibleIds = data.items.filter((l) => VISIBLE_LOAD_STATUSES.includes(l.status)).map((l) => l.id);
  return (
    <div className="space-y-4">
      {visibleIds.length > 1 && <BulkConfirm formId={BULK_FORM} visibleIds={visibleIds} />}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleIds.length > 1 && (
                <TableHead className="w-10">
                  <span className="sr-only">Seç</span>
                </TableHead>
              )}
              <TableHead>Güzergâh</TableHead>
              <TableHead>Yükleme</TableHead>
              <TableHead>Yük</TableHead>
              <TableHead>Fiyat</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>Son teyit</TableHead>
              <TableHead>Teklif</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">İşlem</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((l) => (
              <TableRow key={l.id} data-load-id={l.id}>
                {visibleIds.length > 1 && (
                  <TableCell>
                    {VISIBLE_LOAD_STATUSES.includes(l.status) && (
                      <input
                        type="checkbox"
                        name="ids"
                        value={l.id}
                        form={BULK_FORM}
                        aria-label={`Seç: ${place(l.origin)} → ${place(l.dest)}`}
                        className="size-5 accent-primary"
                      />
                    )}
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <Link href={`/panel/ilanlar/${l.id}`} className="underline-offset-4 hover:underline">
                    {place(l.origin)} → {place(l.dest)}
                  </Link>
                </TableCell>
                <TableCell>{dayRange(l.loadFrom, l.loadTo)}</TableCell>
                <TableCell>
                  {CARGO_TYPES[l.cargoType]}, {l.weightTon} ton
                  <div className="text-xs text-muted-foreground">{VEHICLE_TYPES[l.vehicleType]}</div>
                </TableCell>
                <TableCell>{l.priceType === "sabit" && l.price !== null ? tl(l.price) : "Teklif usulü"}</TableCell>
                <TableCell>
                  <LoadStatusBadge status={l.status} />
                </TableCell>
                <TableCell>{VISIBLE_LOAD_STATUSES.includes(l.status) ? ago(l.lastConfirmedAt) : "—"}</TableCell>
                <TableCell>
                  {l.pendingOffers > 0 ? (
                    <Link href={`/panel/ilanlar/${l.id}#teklifler`} className="font-semibold text-primary underline-offset-4 hover:underline">
                      {l.pendingOffers} teklif
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{VISIBLE_LOAD_STATUSES.includes(l.status) && <ConfirmButton id={l.id} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <nav className="flex justify-between" aria-label="Sayfalar">
        {page > 1 ? (
          <Link className={buttonVariants({ variant: "outline" })} href={`/panel/ilanlar?sayfa=${page - 1}`}>
            Önceki
          </Link>
        ) : (
          <span />
        )}
        {data.hasMore && (
          <Link className={buttonVariants({ variant: "outline" })} href={`/panel/ilanlar?sayfa=${page + 1}`}>
            Sonraki
          </Link>
        )}
      </nav>
    </div>
  );
}
