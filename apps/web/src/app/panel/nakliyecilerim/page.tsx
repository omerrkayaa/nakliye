import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { ago, phoneText } from "@/lib/format";
import type { CarrierRelation, Me } from "@/lib/types";
import { BecomeShipper } from "../become-shipper";
import { FavoriteButton } from "./favorite-button";

export const metadata: Metadata = { title: "Nakliyecilerim" };

/** P7: daha önce iş yapılan nakliyeciler ve favoriler; favorilere yeni ilan yayına çıkınca doğrudan haber verilir. */
export default function CarriersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nakliyecilerim</h1>
        <p className="text-muted-foreground">
          Birlikte iş yaptığınız nakliyeciler. Favorilerinize, yeni ilanınız yayına çıkınca güzergâhları ne olursa olsun haber verilir.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
        <Carriers />
      </Suspense>
    </div>
  );
}

const reputation = (r: CarrierRelation["reputation"]) =>
  r.rating !== null ? `★ ${String(r.rating).replace(".", ",")} (${r.ratingCount}) · ${r.completedJobs} iş` : r.completedJobs > 0 ? `${r.completedJobs} iş · henüz puan yok` : "Yeni üye";

async function Carriers() {
  const me = await api<Me>("/me");
  if (!me.roles.includes("shipper")) return <BecomeShipper />;
  const { items } = await api<{ items: CarrierRelation[] }>("/me/carriers");
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        Henüz bir nakliyeciyle iş yapmadınız. Bir teklifi kabul ettiğinizde nakliyeci burada görünür.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((c) => (
        <li key={c.id} data-carrier-id={c.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-semibold">
              {c.displayName ?? "Adsız nakliyeci"}
              {c.verified && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <BadgeCheck className="size-4" aria-hidden /> Doğrulanmış
                </span>
              )}
              {c.frozen && <span className="text-xs font-medium text-muted-foreground">Hesabı dondurulmuş</span>}
            </p>
            <p className="text-sm">
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="underline-offset-4 hover:underline">
                  {phoneText(c.phone)}
                </a>
              ) : (
                <span className="text-muted-foreground">Hesap silindi</span>
              )}
              <span className="text-muted-foreground"> · {reputation(c.reputation)}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Sizinle {c.jobsWithYou} taşıma ({c.completedWithYou} tamamlandı) · son {ago(c.lastJobAt)}
            </p>
          </div>
          {/* Silinen hesaba bildirim gitmez; favori olamaz */}
          {c.phone && <FavoriteButton id={c.id} favorite={c.favorite} name={c.displayName ?? "Nakliyeci"} />}
        </li>
      ))}
    </ul>
  );
}
