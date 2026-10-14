import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import { MfaGate } from "./guvenlik/totp-setup";

const TABS = [
  ["/panel/yonetim/moderasyon", "İlan moderasyonu"],
  ["/panel/yonetim/belgeler", "Belgeler"],
  ["/panel/yonetim/sikayetler", "Şikayetler"],
  ["/panel/yonetim/itirazlar", "İtirazlar"],
  ["/panel/yonetim/kullanicilar", "Kullanıcılar"],
  ["/panel/yonetim/metrikler", "Metrikler"],
  ["/panel/yonetim/guvenlik", "Güvenlik"],
] as const;

/**
 * Yönetici paneli (Y1–Y5, itirazlar). Yetki API'de (admin rolü); burada yalnız yönetici olmayana sayfa gösterilmez.
 * NFR-04: yönetici rolü belirtece yalnız ikinci adımla girer; doğrulama uygulaması kurulmamışsa her sayfa kurulumu gösterir.
 */
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
  if (me.adminMfa === "giris") {
    return <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Yönetici bölümü için çıkış yapıp yeniden giriş yapın (SMS kodu ve doğrulama uygulamasındaki kod).</p>;
  }
  // Kurulumda ve sonrasında aynı istemci bileşeni: etkinleştirince sunucu "tamam" çizse de kurtarma kodları kaybolmaz
  return <MfaGate setup={me.adminMfa === "kurulum"}>{me.adminMfa === "tamam" ? children : null}</MfaGate>;
}
