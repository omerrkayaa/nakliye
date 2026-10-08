"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { BODY_TYPES, VEHICLE_TYPES } from "@nakliye/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { ago, tl } from "@/lib/format";
import type { Offer } from "@/lib/types";
import { acceptOfferAction, type AcceptState } from "../actions";

const STATUS: Record<Exclude<Offer["status"], "beklemede">, string> = { kabul: "Kabul edildi", ret: "Sonuçlanmadı", geri_cekildi: "Geri çekildi" };

/**
 * P5 teklif karşılaştırma: fiyat, puan, tamamlanan iş, araç yan yana; kabul.
 * Kabul durumu bu (üst) bileşende: sayfa yenilenince kabul edilen satırın düğmesi kaybolsa da teslim kodu ekranda kalır.
 */
export function OffersList({ offers, canAccept }: { offers: Offer[]; canAccept: boolean }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptOfferAction, {});

  return (
    <div className="space-y-4">
      {state.deliveryCode && (
        <div role="status" className="space-y-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
          <p className="font-semibold">Teklif kabul edildi, taşıma oluştu. Nakliyecinin numarası taşıma sayfasında.</p>
          <p>
            Teslim kodunuz:{" "}
            <span className="font-mono text-2xl font-bold tracking-[0.3em]" data-testid="delivery-code">
              {state.deliveryCode}
            </span>
          </p>
          <p className="text-sm">
            Bu kodu yükü teslim alacak kişiye verin; nakliyeci teslimde bu kodu girer. Yükleme sırasında şoförle paylaşmayın. Kod ayrıca SMS ile
            gönderildi.
          </p>
          <Link href={`/panel/tasimalar/${state.jobId}`} className={buttonVariants({ className: "h-11" })}>
            Taşımaya git
          </Link>
        </div>
      )}
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}
      {offers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Henüz teklif yok. Teklif gelince bildirim alırsınız.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {offers.map((o) => (
            <li key={o.id} data-offer-id={o.id} className="grid gap-3 p-4 sm:grid-cols-[8rem_1fr_auto] sm:items-center">
              <div className="text-xl font-bold">{tl(o.price)}</div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{o.carrier.displayName ?? "Nakliyeci"}</span>
                  {o.carrier.verified && (
                    <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                      <BadgeCheck className="size-4" aria-hidden /> Doğrulanmış
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-4 text-brand-accent" aria-hidden />
                    {o.carrier.rating === null ? "Henüz puan yok" : `${o.carrier.rating.toLocaleString("tr-TR")} (${o.carrier.ratingCount} puan)`}
                  </span>
                  <span>{o.carrier.completedJobs} tamamlanmış iş</span>
                  <span>
                    {VEHICLE_TYPES[o.vehicle.vehicleType]}, {BODY_TYPES[o.vehicle.bodyType].toLocaleLowerCase("tr-TR")}, {o.vehicle.capacityTon} ton
                  </span>
                  <span>{ago(o.createdAt)}</span>
                </div>
                {o.note && <p className="text-sm">&ldquo;{o.note}&rdquo;</p>}
              </div>
              <div className="sm:text-right">
                {o.status === "beklemede" ? (
                  canAccept && (
                    <form action={action}>
                      <input type="hidden" name="offerId" value={o.id} />
                      <Button
                        type="submit"
                        disabled={pending}
                        className="h-11"
                        onClick={(e) => {
                          if (!window.confirm(`${tl(o.price)} teklifini kabul ediyor musunuz? Diğer teklifler sonuçlanır ve ilan kapanır.`)) e.preventDefault();
                        }}
                      >
                        Kabul et
                      </Button>
                    </form>
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">{STATUS[o.status]}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
