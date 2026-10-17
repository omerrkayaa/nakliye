import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ArrowRight, Info } from "lucide-react";
import { PriceForm } from "@/components/price-form";
import { PriceTable } from "@/components/price-table";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { buttonVariants } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { TR_PROVINCES } from "@/lib/provinces";
import { ROUTE_PAGES } from "@/lib/route-pages";
import type { RouteSummary } from "@/lib/types";

export const metadata: Metadata = {
  title: "Nakliye fiyatı hesapla",
  description: "İki il arasında karayolu mesafesi ve araç tipine göre tahmini taşıma ücreti aralığı: tır, kırkayak, kamyon, kamyonet, panelvan.",
  alternates: { canonical: "/fiyat" },
};

const PROVINCE_IDS = new Set(TR_PROVINCES.map(([id]) => id));

/** Fiyat hesaplayıcı (F7, girişsiz): il → il, araç tiplerine göre tahmini aralık. Hesap API'de (GET /public/routes/:from/:to). */
export default function PricePage({ searchParams }: PageProps<"/fiyat">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-balance sm:text-4xl">Nakliye fiyatı hesapla</h1>
          <p className="text-lg text-muted-foreground">İki il seçin; karayolu mesafesini ve araç tipine göre tahmini taşıma ücretini görün.</p>
        </div>
        <Suspense fallback={<PriceForm />}>
          <Result searchParams={searchParams} />
        </Suspense>
        <section aria-labelledby="nasil-hesap" className="space-y-2 rounded-lg border bg-muted/40 p-5 text-sm">
          <h2 id="nasil-hesap" className="flex items-center gap-2 text-base font-semibold">
            <Info className="size-4" aria-hidden /> Bu aralık nasıl hesaplanıyor?
          </h2>
          <p>
            Henüz gerçek iş fiyatlarından değil, maliyetten hesaplanıyor: aracın yakıt tüketimi, lastik ve bakım gideri ile şoför günlüğü toplanır, üzerine bir
            kâr payı aralığı eklenir. Katsayılar başlangıç varsayımıdır; platformda taşıma yapıldıkça gerçek fiyatlarla düzeltilecek.
          </p>
          <p>
            Mesafe, iki ilin merkezine en yakın ilçeler arasındaki karayolu mesafesidir (OpenStreetMap). Otoyol ve köprü ücreti dahil değildir; gerçek fiyat yüke,
            tarihe ve yükleme yerine göre değişir.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

async function Result({ searchParams }: { searchParams: PageProps<"/fiyat">["searchParams"] }) {
  const q = await searchParams;
  const from = Number(q.nereden), to = Number(q.nereye);
  const picked = PROVINCE_IDS.has(from) && PROVINCE_IDS.has(to);
  const form = <PriceForm from={picked ? from : undefined} to={picked ? to : undefined} />;
  if (q.nereden === undefined && q.nereye === undefined) return form;
  if (!picked) return <Problem form={form} text="İl bulunamadı. Listeden iki il seçin." />;
  if (from === to) return <Problem form={form} text="Kalkış ve varış ili farklı olmalı." />;

  let s: RouteSummary;
  try {
    s = await api<RouteSummary>(`/public/routes/${from}/${to}`, { auth: false });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return <Problem form={form} text="Şu an hesaplanamadı, biraz sonra yeniden deneyin." />;
  }
  const page = ROUTE_PAGES.find((r) => r.from.id === from && r.to.id === to);
  return (
    <>
      {form}
      <section aria-labelledby="sonuc" className="space-y-3">
        <h2 id="sonuc" className="text-2xl font-bold">
          {s.from.name} → {s.to.name}: {s.source === "karayolu" ? "" : "yaklaşık "}
          {s.distanceKm} km
        </h2>
        <PriceTable summary={s} />
        <p className="text-sm">{s.activeLoads > 0 ? `Bu güzergâhta şu an yayında ${s.activeLoads} ilan var.` : "Bu güzergâhta şu an yayında ilan yok."}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
          <Link href={`/panel/ilanlar/yeni?nereden=${from}&nereye=${to}`} className={buttonVariants({ className: "h-11 px-5" })}>
            Bu güzergâhta ilan ver <ArrowRight aria-hidden />
          </Link>
          {page && (
            <Link href={page.path} className="text-sm text-primary underline-offset-4 hover:underline">
              {page.from.name} – {page.to.name} nakliye sayfası
            </Link>
          )}
        </div>
      </section>
    </>
  );
}

function Problem({ form, text }: { form: ReactNode; text: string }) {
  return (
    <>
      {form}
      <p role="alert" className="text-sm font-medium text-destructive">
        {text}
      </p>
    </>
  );
}
