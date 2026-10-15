import type { Metadata } from "next";
import { Suspense } from "react";
import { AUDIT_ACTIONS, AUDIT_TARGETS } from "@nakliye/shared";
import { api } from "@/lib/api";
import { ago, phoneText } from "@/lib/format";
import type { AuditItem, Page } from "@/lib/types";
import { Pager } from "../pager";

export const metadata: Metadata = { title: "İşlem kaydı" };

const timeFmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" });

/**
 * NFR-05 yönetici işlem kaydı: belge açma ve tüm kararlar (kim, ne zaman, kimi etkiledi). Yeniden eskiye. Kayıt
 * değiştirilemez; kişi hakkındaki işlemleri kendi veri dökümünde görür.
 */
export default function AuditPage({ searchParams }: PageProps<"/panel/yonetim/kayitlar">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: Pick<PageProps<"/panel/yonetim/kayitlar">, "searchParams">) {
  const { sayfa } = await searchParams;
  const page = Math.max(1, Number(typeof sayfa === "string" ? sayfa : 1) || 1);
  const data = await api<Page<AuditItem>>(`/admin/audit?page=${page}`);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Yöneticilerin belge açma ve karar işlemleri. Kayıt silinemez ve düzenlenemez; kişi hakkındaki işlemleri kendi veri dökümünde görür.</p>
      {data.items.length === 0 && page === 1 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Henüz işlem yok.</p>
      ) : (
        <ul className="divide-y rounded-lg border" data-testid="audit-list">
          {data.items.map((e) => (
            <li key={e.id} data-audit-id={e.id} className="space-y-1 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <span className="font-semibold">{e.admin.name ?? "Adsız yönetici"}</span> <span className="text-muted-foreground">({phoneText(e.admin.phone)})</span> ·{" "}
                  <span className="font-medium">{AUDIT_ACTIONS[e.action]}</span>
                </p>
                <time dateTime={e.createdAt} title={ago(e.createdAt)} className="text-sm text-muted-foreground">
                  {timeFmt.format(new Date(e.createdAt))}
                </time>
              </div>
              <p className="text-sm text-muted-foreground">
                {AUDIT_TARGETS[e.targetType]} · <span className="font-mono text-xs">{e.targetId.slice(0, 8)}</span>
                {e.subject && ` · Etkilenen: ${e.subject.status === "silindi" ? "Silinmiş kullanıcı" : (e.subject.name ?? "Adsız")}`}
              </p>
              {e.note && <p className="text-sm">“{e.note}”</p>}
            </li>
          ))}
        </ul>
      )}
      <Pager base="/panel/yonetim/kayitlar" page={page} hasMore={data.hasMore} />
    </div>
  );
}
