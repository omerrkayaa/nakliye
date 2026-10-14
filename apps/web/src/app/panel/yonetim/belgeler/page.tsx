import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DOCUMENT_TYPES, VEHICLE_TYPES } from "@nakliye/shared";
import { api } from "@/lib/api";
import { ago, phoneText } from "@/lib/format";
import type { AdminDocument, DocumentStatus, Page } from "@/lib/types";
import { cn } from "cn";
import { DocumentReviewForm } from "../admin-forms";
import { Pager } from "../pager";

export const metadata: Metadata = { title: "Belgeler" };

const TABS: [DocumentStatus, string][] = [
  ["bekliyor", "Bekleyen"],
  ["onay", "Onaylanan"],
  ["ret", "Reddedilen"],
];

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const day = (d: string) => d.split("-").reverse().join(".");

/**
 * Y1 — Belge onay kuyruğu (FR-50): bekleyenler eskiden yeniye. Onay doğrulama seviyesini yükseltir (BR-10); vergi levhası
 * onayı firmayı doğrular. Dosya yeni sekmede /panel/belgeler/<id> ile açılır (yöneticinin açması API'de loglanır).
 */
export default function DocumentsPage({ searchParams }: PageProps<"/panel/yonetim/belgeler">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
      <Documents searchParams={searchParams} />
    </Suspense>
  );
}

async function Documents({ searchParams }: Pick<PageProps<"/panel/yonetim/belgeler">, "searchParams">) {
  const { durum, sayfa } = await searchParams;
  const status: DocumentStatus = durum === "onay" || durum === "ret" ? durum : "bekliyor";
  const page = Math.max(1, Number(typeof sayfa === "string" ? sayfa : 1) || 1);
  const data = await api<Page<AdminDocument>>(`/admin/documents?status=${status}&page=${page}`);
  const base = "/panel/yonetim/belgeler";

  return (
    <div className="space-y-4">
      <nav aria-label="Belge durumu" className="flex gap-4 border-b">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={k === "bekliyor" ? base : `${base}?durum=${k}`}
            aria-current={k === status ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-1 pb-2 text-sm font-medium", k === status ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}
          >
            {label}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 && page === 1 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{status === "bekliyor" ? "İnceleme bekleyen belge yok." : "Bu durumda belge yok."}</p>
      ) : (
        <ul className="space-y-3">
          {data.items.map((d) => (
            <li key={d.id} data-document-id={d.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{DOCUMENT_TYPES[d.type]}</p>
                <span className="text-sm text-muted-foreground">
                  {ago(d.createdAt)} · {size(d.sizeBytes)}
                </span>
              </div>
              <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                <p>
                  Sahibi: <span className="font-medium">{d.owner.name ?? "Adsız"}</span> · {phoneText(d.owner.phone)}
                </p>
                {d.vehicle && (
                  <p>
                    Araç: <span className="font-medium">{d.vehicle.plate}</span> · {VEHICLE_TYPES[d.vehicle.vehicleType]}
                  </p>
                )}
                {d.type === "vergi_levhasi" && d.uploadedAs && (
                  <p>
                    Firma (yüklemede): <span className="font-medium">{d.uploadedAs.title}</span>
                    {d.uploadedAs.taxNo && ` · VKN ${d.uploadedAs.taxNo}`}
                    {d.company?.taxOffice && ` · ${d.company.taxOffice} VD`}
                  </p>
                )}
                {d.companyChanged && (
                  <p role="status" className="font-medium text-destructive">
                    Firma bilgisi yüklemeden sonra değişti{d.company ? ` (şimdi: ${d.company.title}${d.company.taxNo ? `, VKN ${d.company.taxNo}` : ""})` : ""}. Onaylanamaz; belgeyi
                    reddedin.
                  </p>
                )}
              </div>
              <a href={`/panel/belgeler/${d.id}`} target="_blank" rel="noopener" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
                Belgeyi aç ({d.contentType === "application/pdf" ? "PDF" : "görsel"})
              </a>
              {status === "bekliyor" ? (
                <DocumentReviewForm id={d.id} />
              ) : (
                <p className="text-sm">
                  <span className="font-medium">{status === "onay" ? "Onaylandı" : "Reddedildi"}</span>
                  {d.reviewedAt && ` · ${ago(d.reviewedAt)}`}
                  {d.expiresAt && ` · geçerlilik sonu ${day(d.expiresAt)}`}
                  {d.rejectReason && ` — ${d.rejectReason}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager base={base} page={page} hasMore={data.hasMore} query={status === "bekliyor" ? "" : `durum=${status}&`} />
    </div>
  );
}
