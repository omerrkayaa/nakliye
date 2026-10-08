import type { Metadata } from "next";
import { Suspense } from "react";
import { USER_STATUS_LABELS } from "@nakliye/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { phoneText, score } from "@/lib/format";
import type { AdminUser, Page } from "@/lib/types";
import { SuspendForm, UnsuspendButton } from "../admin-forms";
import { Pager } from "../pager";

export const metadata: Metadata = { title: "Kullanıcılar" };

/** Y2 — Kullanıcı arama (numara ya da ad) ve askıya alma. Arama boşken askıdaki hesaplar listelenir. */
export default function UsersPage({ searchParams }: PageProps<"/panel/yonetim/kullanicilar">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

async function Users({ searchParams }: Pick<PageProps<"/panel/yonetim/kullanicilar">, "searchParams">) {
  const { q: rawQ, sayfa } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.trim().slice(0, 80) : "";
  const page = Math.max(1, Number(typeof sayfa === "string" ? sayfa : 1) || 1);
  const data = await api<Page<AdminUser>>(`/admin/users?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`);

  return (
    <div className="space-y-4">
      <form role="search" className="flex max-w-lg gap-2">
        <label htmlFor="q" className="sr-only">
          Numara ya da ad
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder="Numara (en az 4 hane) ya da ad" className="h-11" />
        <Button type="submit" className="h-11">
          Ara
        </Button>
      </form>
      <h2 className="text-lg font-semibold">{q ? `“${q}” için sonuçlar` : "Askıdaki hesaplar"}</h2>
      {data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{q ? "Kullanıcı bulunamadı." : "Askıda hesap yok."}</p>
      ) : (
        <ul className="space-y-3">
          {data.items.map((u) => {
            const who = u.name ?? phoneText(u.phone);
            return (
              <li key={u.id} data-user-id={u.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">{u.name ?? "Adsız"}</p>
                  <p>
                    {phoneText(u.phone)} · güven {score(u.trustScore)} · <span className={u.status === "askida" ? "font-semibold text-destructive" : ""}>{USER_STATUS_LABELS[u.status]}</span>
                  </p>
                  {u.suspendReason && <p className="text-muted-foreground">Sebep: {u.suspendReason}</p>}
                </div>
                {u.status === "askida" ? <UnsuspendButton id={u.id} who={who} /> : <SuspendForm id={u.id} who={who} />}
              </li>
            );
          })}
        </ul>
      )}
      <Pager base="/panel/yonetim/kullanicilar" page={page} hasMore={data.hasMore} query={q ? `q=${encodeURIComponent(q)}&` : ""} />
    </div>
  );
}
