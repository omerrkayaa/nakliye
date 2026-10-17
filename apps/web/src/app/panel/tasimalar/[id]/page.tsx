import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BadgeCheck, Phone, Star } from "lucide-react";
import { BODY_TYPES, CARGO_TYPES, RATING_TAGS, VEHICLE_TYPES } from "@nakliye/shared";
import { JobStatusBadge } from "@/components/job-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { dayRange, place, tl } from "@/lib/format";
import type { JobDetail, RatingView } from "@/lib/types";
import { JobActions } from "./job-actions";
import { RatingForm } from "./rating-form";

export const metadata: Metadata = { title: "Taşıma" };

const when = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const at = (iso: string) => when.format(new Date(iso));

const EVENT: Record<string, string> = {
  olusturuldu: "Teklif kabul edildi, taşıma oluştu",
  yuklendi: "Yük araca yüklendi",
  yolda: "Yola çıkıldı",
  teslim_edildi: "Teslim edildi (teslim kodu girildi)",
  tamamlandi: "Taşıma tamamlandı",
  itirazli: "Teslime itiraz edildi",
  iptal: "Taşıma iptal edildi",
  hatali_kod: "Hatalı teslim kodu denendi",
  yeni_kod: "Yeni teslim kodu oluşturuldu",
};
const BY = { shipper: "siz", carrier: "nakliyeci", system: "sistem", admin: "yönetici" } as const;

/** P6 taşıma detayı: karşı taraf (numara açık, FR-32), araç, durum işlemleri, puanlama, zaman çizelgesi. */
export default function JobPage({ params }: PageProps<"/panel/tasimalar/[id]">) {
  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/panel/tasimalar" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← Taşımalar
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
        <JobView params={params} />
      </Suspense>
    </div>
  );
}

async function JobView({ params }: Pick<PageProps<"/panel/tasimalar/[id]">, "params">) {
  const { id } = await params;
  let j: JobDetail;
  try {
    j = await api<JobDetail>(`/jobs/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const shipper = j.role === "shipper";

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">
              {place(j.load.origin)} → {place(j.load.dest)}
            </h1>
            <p className="text-muted-foreground">
              {dayRange(j.load.loadFrom, j.load.loadTo)} yükleme · {j.agreedPrice !== null ? tl(j.agreedPrice) : "—"}
            </p>
          </div>
          <JobStatusBadge status={j.status} />
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Item term={shipper ? "Nakliyeci" : "Yük sahibi"}>
              <span className="inline-flex items-center gap-2">
                {j.counterpart.displayName ?? "—"}
                {j.counterpart.verified && <BadgeCheck className="size-4 text-emerald-700 dark:text-emerald-400" aria-label="Doğrulanmış" />}
              </span>
            </Item>
            <Item term="Telefon">
              {j.counterpart.phone ? (
                <a href={`tel:${j.counterpart.phone}`} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                  <Phone className="size-4" aria-hidden /> 0{j.counterpart.phone.slice(3)}
                </a>
              ) : (
                "— (hesap silindi)"
              )}
            </Item>
            <Item term="Araç">
              {j.vehicle.plate} · {VEHICLE_TYPES[j.vehicle.vehicleType]}, {BODY_TYPES[j.vehicle.bodyType].toLocaleLowerCase("tr-TR")}
            </Item>
            <Item term="Yük">
              {CARGO_TYPES[j.load.cargoType]}, {j.load.weightTon} ton
            </Item>
          </dl>
          <StatusNote j={j} />
          {shipper ? (
            <JobActions id={j.id} status={j.status} />
          ) : (
            <p className="text-sm text-muted-foreground">Bu taşımada nakliyecisiniz; yükleme ve teslim işlemleri Android uygulamasından yapılır.</p>
          )}
        </CardContent>
      </Card>

      {j.status === "tamamlandi" && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Puanlama</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {j.rating.given ? (
              <RatingLine title="Verdiğiniz puan" r={j.rating.given} />
            ) : j.rating.canRate ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {j.rating.deadline && `Son gün ${at(j.rating.deadline)}. `}Puanınız, karşı taraf da puanlayınca ya da süre bitince görünür.
                </p>
                <RatingForm id={j.id} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Puanlama süresi doldu.</p>
            )}
            {j.rating.received &&
              (j.rating.received.revealed ? (
                <RatingLine title="Aldığınız puan" r={j.rating.received} />
              ) : (
                <p className="text-sm">Karşı taraf sizi puanladı; puanı siz de puanlayınca ya da süre bitince görünür.</p>
              ))}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Zaman çizelgesi</h2>
        <ol className="space-y-2 border-l pl-4">
          {j.events.map((e, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium">{EVENT[e.type] ?? e.type}</span>
              <span className="text-muted-foreground">
                {" "}
                · {at(e.at)} · {BY[e.by]}
                {typeof e.meta?.reason === "string" ? ` · “${e.meta.reason}”` : ""}
                {typeof e.meta?.note === "string" ? ` · “${e.meta.note}”` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function StatusNote({ j }: { j: JobDetail }) {
  const box = "rounded-lg border p-4 text-sm";
  switch (j.status) {
    case "anlasildi":
    case "yuklendi":
    case "yolda":
      return (
        <p className={box}>
          Teslimde nakliyeci, yükü teslim alan kişiden 6 haneli teslim kodunu alıp girer. Kod kaybolduysa yenisini oluşturun; kod girilemezse teslimi
          elle onaylayabilirsiniz. Kalan kod denemesi: {j.deliveryCodeAttemptsLeft}.
        </p>
      );
    case "teslim_edildi":
      return (
        <p className={`${box} border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100`}>
          Yük teslim edildi. Sorun varsa {j.autoCompleteAt ? `${at(j.autoCompleteAt)} tarihine kadar` : "48 saat içinde"} itiraz edin; itiraz
          edilmezse taşıma otomatik tamamlanır.
        </p>
      );
    case "itirazli":
      return <p className={`${box} border-destructive/30 bg-destructive/5`}>İtirazınız alındı; yönetici inceleyecek.</p>;
    case "iptal":
      return (
        <div className={`${box} space-y-3`}>
          <p>Taşıma iptal edildi{j.cancelReason ? `: “${j.cancelReason}”` : "."}</p>
          {j.role === "shipper" && (
            <>
              <p className="text-muted-foreground">İlanınız iptalle birlikte kapandı. Aynı yük için yeniden teklif almak isterseniz yeniden yayınlayın.</p>
              <Link href={`/panel/ilanlar/yeni?kopya=${j.load.id}`} className={buttonVariants({ className: "h-11" })}>
                İlanı yeniden yayınla
              </Link>
            </>
          )}
        </div>
      );
    default:
      return null;
  }
}

function RatingLine({ title, r }: { title: string; r: RatingView }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="flex items-center gap-1 font-medium" aria-label={`${r.stars} yıldız`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={`size-5 ${i < r.stars ? "fill-brand-accent text-brand-accent" : "text-muted-foreground"}`} aria-hidden />
        ))}
      </p>
      {r.tags.length > 0 && <p className="text-sm">{r.tags.map((t) => RATING_TAGS[t]).join(" · ")}</p>}
      {r.comment && <p className="text-sm">&ldquo;{r.comment}&rdquo;</p>}
    </div>
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
