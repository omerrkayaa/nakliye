import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NOTIFICATION_TYPES } from "@nakliye/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import type { Notification, Page } from "@/lib/types";
import { cn } from "cn";
import { openNotificationAction, readAllAction } from "./actions";
import { ConfirmAnswer } from "./confirm-answer";

export const metadata: Metadata = { title: "Bildirimler" };

/**
 * Bildirimin paneldeki karşılığı. Web yük sahibi panelidir: nakliyeciye ait bildirimler (uygun yük, rota alarmı,
 * teklif sonucu) mobil uygulamadadır; burada metin olarak görünür.
 */
function target(n: Notification): string | null {
  if (n.data.jobId) return `/panel/tasimalar/${n.data.jobId}`;
  if ((n.type === "offer_new" || n.type === "match_for_shipper" || n.type === "load_confirm") && n.data.loadId) {
    return `/panel/ilanlar/${n.data.loadId}${n.type === "offer_new" ? "#teklifler" : ""}`;
  }
  return null;
}

export default function NotificationsPage({ searchParams }: PageProps<"/panel/bildirimler">) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bildirimler</h1>
      <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: Pick<PageProps<"/panel/bildirimler">, "searchParams">) {
  const raw = (await searchParams).sayfa;
  const page = Math.max(1, Number(typeof raw === "string" ? raw : 1) || 1);
  const data = await api<Page<Notification> & { unread: number }>(`/notifications?page=${page}`);
  if (data.items.length === 0 && page === 1) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Henüz bildiriminiz yok.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">{data.unread > 0 ? `${data.unread} okunmamış` : "Hepsi okundu"}</p>
        {data.unread > 0 && (
          <form action={readAllAction}>
            <Button type="submit" variant="outline">
              Tümünü okundu say
            </Button>
          </form>
        )}
      </div>
      <ul className="space-y-2">
        {data.items.map((n) => {
          const unread = !n.readAt;
          const to = target(n);
          return (
            <li key={n.id} data-notification-id={n.id} className={cn("space-y-2 rounded-lg border p-4", unread && "border-l-4 border-l-primary")}>
              <form action={openNotificationAction}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="to" value={to ?? ""} />
                <button type="submit" className="w-full space-y-1 text-left" aria-label={`${unread ? "Okunmamış: " : ""}${n.title}`}>
                  <span className="block text-xs text-muted-foreground">
                    {NOTIFICATION_TYPES[n.type]} · {ago(n.createdAt)}
                  </span>
                  <span className={cn("block", unread ? "font-semibold" : "font-medium")}>{n.title}</span>
                  <span className="block text-sm text-muted-foreground">{n.body}</span>
                  {!to && <span className="block text-xs text-muted-foreground">Ayrıntısı mobil uygulamada.</span>}
                </button>
              </form>
              {n.type === "load_confirm" && n.data.loadId && <ConfirmAnswer id={n.id} loadId={n.data.loadId} />}
            </li>
          );
        })}
      </ul>
      {(page > 1 || data.hasMore) && (
        <nav className="flex justify-between" aria-label="Sayfalar">
          {page > 1 ? (
            <Link className={buttonVariants({ variant: "outline" })} href={`/panel/bildirimler?sayfa=${page - 1}`}>
              Önceki
            </Link>
          ) : (
            <span />
          )}
          {data.hasMore && (
            <Link className={buttonVariants({ variant: "outline" })} href={`/panel/bildirimler?sayfa=${page + 1}`}>
              Sonraki
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
