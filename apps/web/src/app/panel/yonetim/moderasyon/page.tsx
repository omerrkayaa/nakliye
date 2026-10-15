import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BODY_TYPES, CARGO_TYPES, VEHICLE_TYPES } from "@nakliye/shared";
import { api } from "@/lib/api";
import { ago, dayRange, phoneText, place, tl } from "@/lib/format";
import type { AdminLoad, Page } from "@/lib/types";
import { ReviewButtons } from "../admin-forms";
import { Pager } from "../pager";

export const metadata: Metadata = { title: "İlan moderasyonu" };

/** Y4 — Yeni hesapların ilk ilanları (BR-11): eskiden yeniye; onaylanınca yayına çıkar ve eşleştirme çalışır. */
export default function ModerationPage({ searchParams }: PageProps<"/panel/yonetim/moderasyon">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
      <Queue searchParams={searchParams} />
    </Suspense>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/panel/yonetim/moderasyon">, "searchParams">) {
  const raw = (await searchParams).sayfa;
  const page = Math.max(1, Number(typeof raw === "string" ? raw : 1) || 1);
  const data = await api<Page<AdminLoad>>(`/admin/loads?page=${page}`);
  if (data.items.length === 0 && page === 1) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Onay bekleyen ilan yok.</p>;
  }
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Onay bekleyen ilanlar</h2>
      <ul className="space-y-3">
        {data.items.map((l) => (
          <li key={l.id} data-load-id={l.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                {place(l.origin)} → {place(l.dest)}
              </p>
              <span className="text-sm text-muted-foreground">{ago(l.createdAt)} verildi</span>
            </div>
            <p className="text-sm">
              {dayRange(l.loadFrom, l.loadTo)} · {CARGO_TYPES[l.cargoType]}, {l.weightTon} ton · {VEHICLE_TYPES[l.vehicleType]}
              {l.bodyType ? `, ${BODY_TYPES[l.bodyType]}` : ""} · {l.priceType === "sabit" && l.price !== null ? tl(l.price) : "Teklif usulü"}
            </p>
            {l.note && <p className="text-sm text-muted-foreground">Not: {l.note}</p>}
            <p className="text-sm">
              {l.shipper.displayName ?? "Adsız"} ·{" "}
              <Link href={`/panel/yonetim/kullanicilar?q=${encodeURIComponent(phoneText(l.shipperPhone))}`} className="text-primary underline underline-offset-4">
                {phoneText(l.shipperPhone)}
              </Link>
            </p>
            <ReviewButtons id={l.id} />
          </li>
        ))}
      </ul>
      <Pager base="/panel/yonetim/moderasyon" page={page} hasMore={data.hasMore} />
    </div>
  );
}
