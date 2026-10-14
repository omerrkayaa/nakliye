import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";

const TABS = [
  ["/panel/yonetim/moderasyon", "İlan moderasyonu"],
  ["/panel/yonetim/belgeler", "Belgeler"],
  ["/panel/yonetim/sikayetler", "Şikayetler"],
  ["/panel/yonetim/itirazlar", "İtirazlar"],
  ["/panel/yonetim/kullanicilar", "Kullanıcılar"],
  ["/panel/yonetim/metrikler", "Metrikler"],
] as const;

/** Yönetici paneli (Y1–Y5, itirazlar). Yetki API'de (admin rolü); burada yalnız yönetici olmayana sayfa gösterilmez. */
export default function AdminLayout({ children }: LayoutProps<"/panel/yonetim">) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Yönetim</h1>
        <nav aria-label="Yönetim" className="flex flex-wrap gap-2">
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-full border px-4 py-2 text-sm font-medium hover:bg-muted">
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
        <AdminOnly>{children}</AdminOnly>
      </Suspense>
    </div>
  );
}

async function AdminOnly({ children }: { children: ReactNode }) {
  const me = await api<Me>("/me");
  if (!me.roles.includes("admin")) return <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Bu bölüm yalnız yöneticiler içindir.</p>;
  return children;
}
