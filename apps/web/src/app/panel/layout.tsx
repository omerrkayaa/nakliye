import Link from "next/link";
import { Suspense } from "react";
import { LogOut, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import { logoutAction } from "./actions";

export default function PanelLayout({ children }: LayoutProps<"/panel">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <Link href="/panel" className="flex items-center gap-2 font-bold">
            <Truck className="size-5 text-brand-accent" aria-hidden />
            Nakliye
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/panel/ilanlar" className="underline-offset-4 hover:underline">
              İlanlarım
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Suspense>
              <UserName />
            </Suspense>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm" className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">
                <LogOut aria-hidden /> Çıkış
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

async function UserName() {
  const me = await api<Me>("/me");
  return <span className="opacity-90">{me.company?.title ?? me.name ?? `0${me.phone.slice(3)}`}</span>;
}
