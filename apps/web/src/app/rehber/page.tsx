import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Nakliye rehberi",
  description: "Yük sahipleri ve nakliyeciler için kısa rehberler: gerekli belgeler, araç tipleri, parsiyel yük ve nakliye fiyatı.",
  alternates: { canonical: "/rehber" },
};

/** Rehber yazıları dizini (arama motoruna açık). */
export default function GuidesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold sm:text-4xl">Nakliye rehberi</h1>
          <p className="text-lg text-muted-foreground">Yük sahipleri ve nakliyeciler için kısa, kaynaklı bilgiler.</p>
        </div>
        <ul className="space-y-3">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/rehber/${g.slug}`} className="group block space-y-1 rounded-lg border bg-card p-5 hover:border-primary/50">
                <h2 className="flex items-center gap-2 text-lg font-semibold group-hover:underline">
                  {g.title} <ArrowRight className="size-4 shrink-0" aria-hidden />
                </h2>
                <p className="text-sm text-muted-foreground">{g.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
