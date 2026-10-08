import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CARGO_TYPES, VEHICLE_TYPES, VISIBLE_LOAD_STATUSES } from "@nakliye/shared";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { ago, dayRange, place, tl } from "@/lib/format";
import type { LoadItem, Me, Page } from "@/lib/types";
import { becomeShipperAction } from "../actions";
import { ConfirmButton } from "./confirm-button";

export const metadata: Metadata = { title: "İlanlarım" };

/** P4 İlanlarım: durum, son teyit, "hâlâ geçerli". (Teklif sayısı, toplu teyit ve kapatma sonraki dilimde.) */
export default function LoadsPage({ searchParams }: PageProps<"/panel/ilanlar">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">İlanlarım</h1>
        <p className="text-muted-foreground">Yayındaki ilanlar düzenli olarak size teyit ettirilir; cevapsız kalan ilan listeden düşer.</p>
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
    return <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Henüz ilanınız yok.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Güzergâh</TableHead>
              <TableHead>Yükleme</TableHead>
              <TableHead>Yük</TableHead>
              <TableHead>Fiyat</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>Son teyit</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">İşlem</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((l) => (
              <TableRow key={l.id} data-load-id={l.id}>
                <TableCell className="font-medium">
                  {place(l.origin)} → {place(l.dest)}
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

function BecomeShipper() {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Yük sahibi olarak devam edin</CardTitle>
        <CardDescription>
          Bu panel yük sahipleri içindir. Hesabınıza yük sahibi rolü eklenir; nakliyeci olarak Android uygulamasını kullanmaya
          devam edebilirsiniz.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={becomeShipperAction}>
          <Button type="submit" className="h-11">
            Yük sahibi olarak devam et
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
