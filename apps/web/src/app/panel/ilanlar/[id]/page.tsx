import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BODY_TYPES, CARGO_TYPES, loadShareText, sharePath, VEHICLE_TYPES, VISIBLE_LOAD_STATUSES } from "@nakliye/shared";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { ago, dayRange, place, tl } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import type { LoadDetail, Offer } from "@/lib/types";
import { ConfirmButton } from "../confirm-button";
import { CloseButtons } from "./close-buttons";
import { OffersList } from "./offers-list";
import { ShareButtons } from "./share-buttons";

export const metadata: Metadata = { title: "İlan" };

/** İlan detayı (sahibi): özet, teyit, kapatma ve gelen teklifler (P5). */
export default function LoadPage({ params, searchParams }: PageProps<"/panel/ilanlar/[id]">) {
  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/panel/ilanlar" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← İlanlarım
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
        <Load params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Load({ params, searchParams }: Pick<PageProps<"/panel/ilanlar/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { yeni } = await searchParams;
  let l: LoadDetail;
  try {
    l = await api<LoadDetail>(`/loads/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const visible = VISIBLE_LOAD_STATUSES.includes(l.status);
  const offers = l.status === "moderasyonda" ? [] : (await api<{ items: Offer[] }>(`/loads/${l.id}/offers`)).items;

  return (
    <>
      {yeni && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          {l.status === "moderasyonda"
            ? "İlanınız alındı. Yeni hesapların ilk ilanları kısa bir kontrolden sonra yayına çıkar."
            : "İlanınız yayında. Uygun boş aracı olan ve bu güzergâha alarm kuran nakliyeciler bilgilendirilir."}
        </p>
      )}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">
              {place(l.origin)} → {place(l.dest)}
            </h1>
            <p className="text-muted-foreground">{dayRange(l.loadFrom, l.loadTo)} yükleme</p>
          </div>
          <LoadStatusBadge status={l.status} />
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Item term="Yük">
              {CARGO_TYPES[l.cargoType]}, {l.weightTon} ton
            </Item>
            <Item term="Araç">
              {VEHICLE_TYPES[l.vehicleType]}
              {l.bodyType ? `, ${BODY_TYPES[l.bodyType]}` : ""}
            </Item>
            <Item term="Fiyat">{l.priceType === "sabit" && l.price !== null ? tl(l.price) : "Teklif usulü"}</Item>
            <Item term="Son teyit">{visible ? ago(l.lastConfirmedAt) : "—"}</Item>
            {l.note && <Item term="Not">{l.note}</Item>}
          </dl>
          {(visible || l.status === "moderasyonda") && (
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              {visible && <ConfirmButton id={l.id} />}
              {visible && <ShareButtons url={SITE_URL + sharePath(l.shareId)} text={loadShareText(l, SITE_URL + sharePath(l.shareId))} />}
              <CloseButtons id={l.id} canFind={visible} />
            </div>
          )}
          {!visible && l.status !== "moderasyonda" && (
            <div className="border-t pt-4">
              <Link href={`/panel/ilanlar/yeni?kopya=${l.id}`} className={buttonVariants({ variant: "outline", className: "h-11" })}>
                Benzerini yayınla
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
      {l.status !== "moderasyonda" && (
        <section id="teklifler" className="space-y-3">
          <h2 className="text-lg font-semibold">Teklifler</h2>
          <OffersList offers={offers} canAccept={visible} />
        </section>
      )}
    </>
  );
}

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
