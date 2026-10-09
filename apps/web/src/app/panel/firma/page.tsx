import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { phoneText } from "@/lib/format";
import type { Me } from "@/lib/types";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Firma profili" };

/** P8 firma profili: ad soyad, firma unvanı, vergi no ve dairesi, adres; doğrulama durumu (BR-10, F2). */
export default function CompanyPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Firma profili</h1>
        <p className="text-muted-foreground">Nakliyeciler ilanlarınızda firma unvanınızı görür. Numaranız ilanlarda gizli kalır.</p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
        <Profile />
      </Suspense>
    </div>
  );
}

async function Profile() {
  const me = await api<Me>("/me");
  const c = me.company;
  return (
    <div className="space-y-6">
      <div className="space-y-1 rounded-lg border p-4 text-sm">
        <p>
          Telefon: <span className="font-medium">{phoneText(me.phone)}</span>
        </p>
        {c &&
          (c.verified ? (
            <p className="flex items-center gap-1 font-medium text-emerald-700">
              <BadgeCheck className="size-4" aria-hidden /> Firma doğrulandı
            </p>
          ) : (
            <p className="text-muted-foreground">Firma henüz doğrulanmadı. Unvan ya da vergi numarası değişirse doğrulama yeniden yapılır.</p>
          ))}
      </div>
      <ProfileForm
        hasCompany={c !== null}
        initial={{ name: me.name ?? "", title: c?.title ?? "", taxNo: c?.taxNo ?? "", taxOffice: c?.taxOffice ?? "", address: c?.address ?? "" }}
      />
      <p className="text-sm text-muted-foreground">Firmaya birden çok kullanıcı ekleme henüz yok; her hesap tek telefon numarasıyla girer.</p>
    </div>
  );
}
