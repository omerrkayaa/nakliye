import type { Metadata } from "next";
import { Suspense } from "react";
import { LOAD_DATE_LIMITS, trDay } from "@nakliye/shared";
import { api } from "@/lib/api";
import { getLocations } from "@/lib/locations";
import type { Me } from "@/lib/types";
import { BecomeShipper } from "../../become-shipper";
import { NewLoadForm } from "./new-load-form";

export const metadata: Metadata = { title: "Yeni ilan" };

/** P3 ilan oluştur (tek ekran, docs/02 ilke 4). Excel ile toplu ilan (F5) sonraki dilimde. */
export default function NewLoadPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Yeni ilan</h1>
        <p className="text-muted-foreground">İlanınız yayında kaldığı sürece düzenli olarak &quot;hâlâ geçerli mi?&quot; diye sorulur.</p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  // Önce oturum (dinamik): önbellekli il listesi derlemede değil istekte çağrılsın
  const me = await api<Me>("/me");
  if (!me.roles.includes("shipper")) return <BecomeShipper />;
  const now = new Date();
  const maxDay = trDay(new Date(now.getTime() + LOAD_DATE_LIMITS.maxDaysAhead * 86_400_000));
  return <NewLoadForm provinces={await getLocations()} today={trDay(now)} maxDay={maxDay} />;
}
