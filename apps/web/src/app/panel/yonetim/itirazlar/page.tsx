import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CARGO_TYPES } from "@nakliye/shared";
import { api } from "@/lib/api";
import { ago, dayRange, phoneText, place, tl } from "@/lib/format";
import type { AdminDispute, Page } from "@/lib/types";
import { cn } from "cn";
import { DisputeForm } from "../admin-forms";
import { Pager } from "../pager";

export const metadata: Metadata = { title: "İtirazlar" };

/**
 * İtirazlı taşımalar: yük sahibi teslimden sonra 48 saat içinde itiraz etti. Yönetici iki tarafı arar, karar verir:
 * teslim geçerli → tamamlandı; geçersiz → iptal (nakliyecinin iptal oranına yazılır). Gerekçe iki tarafa gider.
 */
export default function DisputesPage({ searchParams }: PageProps<"/panel/yonetim/itirazlar">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
      <Disputes searchParams={searchParams} />
    </Suspense>
  );
}

async function Disputes({ searchParams }: Pick<PageProps<"/panel/yonetim/itirazlar">, "searchParams">) {
  const { durum, sayfa } = await searchParams;
  const closed = durum === "kapali";
  const page = Math.max(1, Number(typeof sayfa === "string" ? sayfa : 1) || 1);
  const data = await api<Page<AdminDispute>>(`/admin/disputes?status=${closed ? "kapali" : "acik"}&page=${page}`);

  return (
    <div className="space-y-4">
      <nav aria-label="İtiraz durumu" className="flex gap-4 border-b">
        {[
          ["acik", "Açık"],
          ["kapali", "Sonuçlananlar"],
        ].map(([k, label]) => (
          <Link
            key={k}
            href={k === "kapali" ? "/panel/yonetim/itirazlar?durum=kapali" : "/panel/yonetim/itirazlar"}
            aria-current={(k === "kapali") === closed ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-1 pb-2 text-sm font-medium", (k === "kapali") === closed ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}
          >
            {label}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 && page === 1 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{closed ? "Sonuçlanmış itiraz yok." : "Açık itiraz yok."}</p>
      ) : (
        <ul className="space-y-3">
          {data.items.map((d) => (
            <li key={d.id} data-dispute-id={d.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {place(d.load.origin)} → {place(d.load.dest)}
                </p>
                {d.dispute && <span className="text-sm text-muted-foreground">İtiraz {ago(d.dispute.at)}</span>}
              </div>
              <p className="text-sm text-muted-foreground">
                {dayRange(d.load.loadFrom, d.load.loadTo)} · {CARGO_TYPES[d.load.cargoType]}, {d.load.weightTon} ton · {d.vehicle.plate}
                {d.agreedPrice !== null && ` · ${tl(d.agreedPrice)}`}
              </p>
              {d.dispute?.reason && <p className="rounded-md bg-muted/50 p-3 text-sm">Yük sahibinin itirazı: “{d.dispute.reason}”</p>}
              <div className="grid gap-1 text-sm sm:grid-cols-2">
                <p>
                  Yük sahibi: {d.shipper.displayName ?? "Adsız"} ·{" "}
                  <a href={`tel:${d.shipper.phone}`} className="underline-offset-4 hover:underline">
                    {phoneText(d.shipper.phone)}
                  </a>
                </p>
                <p>
                  Nakliyeci: {d.carrier.displayName ?? "Adsız"} ·{" "}
                  <a href={`tel:${d.carrier.phone}`} className="underline-offset-4 hover:underline">
                    {phoneText(d.carrier.phone)}
                  </a>
                </p>
              </div>
              {closed ? (
                <p className="text-sm">
                  <span className="font-medium">{d.decision?.outcome === "tamamlandi" ? "Teslim geçerli: taşıma tamamlandı" : "Teslim geçersiz: taşıma iptal edildi"}</span>
                  {d.decision?.note ? ` — ${d.decision.note}` : ""}
                </p>
              ) : (
                <DisputeForm id={d.id} />
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager base="/panel/yonetim/itirazlar" page={page} hasMore={data.hasMore} query={closed ? "durum=kapali&" : ""} />
    </div>
  );
}
