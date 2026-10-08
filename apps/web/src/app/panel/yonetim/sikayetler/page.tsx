import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LOAD_STATUS_LABELS, REPORT_REASONS, REPORT_STATUS_LABELS } from "@nakliye/shared";
import { api } from "@/lib/api";
import { ago, phoneText, place, score } from "@/lib/format";
import type { AdminReport, AdminUser, Page } from "@/lib/types";
import { cn } from "cn";
import { ResolveForm, SuspendForm, UnsuspendButton } from "../admin-forms";
import { Pager } from "../pager";

export const metadata: Metadata = { title: "Şikayetler" };

/** Y3 — Şikayet kuyruğu (FR-51): açıklar eskiden yeniye; karar "haklı" ise hedefin sahibinin güven skoru düşer. */
export default function ReportsPage({ searchParams }: PageProps<"/panel/yonetim/sikayetler">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ searchParams }: Pick<PageProps<"/panel/yonetim/sikayetler">, "searchParams">) {
  const { durum, sayfa } = await searchParams;
  const closed = durum === "kapali";
  const page = Math.max(1, Number(typeof sayfa === "string" ? sayfa : 1) || 1);
  const data = await api<Page<AdminReport>>(`/admin/reports?status=${closed ? "kapali" : "acik"}&page=${page}`);

  return (
    <div className="space-y-4">
      <nav aria-label="Şikayet durumu" className="flex gap-4 border-b">
        {[
          ["acik", "Açık"],
          ["kapali", "Sonuçlananlar"],
        ].map(([k, label]) => (
          <Link
            key={k}
            href={k === "kapali" ? "/panel/yonetim/sikayetler?durum=kapali" : "/panel/yonetim/sikayetler"}
            aria-current={(k === "kapali") === closed ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-1 pb-2 text-sm font-medium", (k === "kapali") === closed ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}
          >
            {label}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 && page === 1 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{closed ? "Sonuçlanmış şikayet yok." : "Açık şikayet yok."}</p>
      ) : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li key={r.id} data-report-id={r.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{REPORT_REASONS[r.reason]}</p>
                <span className="text-sm text-muted-foreground">{ago(r.createdAt)}</span>
              </div>
              <Target r={r} />
              {r.note && <p className="text-sm">“{r.note}”</p>}
              <p className="text-sm text-muted-foreground">
                Bildiren: {r.reporter.name ?? "Adsız"} · {phoneText(r.reporter.phone)}
              </p>
              {closed ? (
                <p className="text-sm">
                  <span className="font-medium">{REPORT_STATUS_LABELS[r.status]}</span>
                  {r.resolution ? ` — ${r.resolution}` : ""}
                </p>
              ) : (
                <ResolveForm id={r.id} />
              )}
              {r.target.owner && <OwnerActions owner={r.target.owner} />}
            </li>
          ))}
        </ul>
      )}
      <Pager base="/panel/yonetim/sikayetler" page={page} hasMore={data.hasMore} query={closed ? "durum=kapali&" : ""} />
    </div>
  );
}

function Target({ r }: { r: AdminReport }) {
  const o = r.target.owner;
  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
      {r.target.load ? (
        <p>
          İlan: {place(r.target.load.origin)} → {place(r.target.load.dest)} · {LOAD_STATUS_LABELS[r.target.load.status]}
        </p>
      ) : (
        <p>Kullanıcı şikayeti</p>
      )}
      {o && (
        <p>
          {r.target.load ? "İlan sahibi" : "Şikayet edilen"}: {o.name ?? "Adsız"} · {phoneText(o.phone)} · güven {score(o.trustScore)}
          {o.status === "askida" && <span className="font-semibold text-destructive"> · Askıda</span>}
        </p>
      )}
      {r.openOnTarget > 1 && <p className="font-medium text-amber-700">Bu hedefe {r.openOnTarget} açık şikayet var</p>}
    </div>
  );
}

function OwnerActions({ owner }: { owner: AdminUser }) {
  const who = owner.name ?? phoneText(owner.phone);
  return owner.status === "askida" ? <UnsuspendButton id={owner.id} who={who} /> : <SuspendForm id={owner.id} who={who} />;
}
