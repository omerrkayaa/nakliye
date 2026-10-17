import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { phoneText } from "@/lib/format";
import type { Me, MyDocument } from "@/lib/types";
import { ProfileForm } from "./profile-form";
import { TaxPlateForm } from "./tax-plate-form";

export const metadata: Metadata = { title: "Firma profili" };

/** P8 firma profili: ad soyad, firma unvanı, vergi no ve dairesi, adres; doğrulama durumu ve vergi levhası (BR-10, F2, FR-05). */
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
            <p className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
              <BadgeCheck className="size-4" aria-hidden /> Firma doğrulandı
            </p>
          ) : (
            <p className="text-muted-foreground">Firma henüz doğrulanmadı. Unvan ya da vergi numarası değişirse doğrulama yeniden yapılır.</p>
          ))}
      </div>
      {me.roles.includes("shipper") && <TaxPlate me={me} />}
      <ProfileForm
        hasCompany={c !== null}
        initial={{ name: me.name ?? "", title: c?.title ?? "", taxNo: c?.taxNo ?? "", taxOffice: c?.taxOffice ?? "", address: c?.address ?? "" }}
      />
      <p className="text-sm text-muted-foreground">Firmaya birden çok kullanıcı ekleme henüz yok; her hesap tek telefon numarasıyla girer.</p>
    </div>
  );
}

/**
 * Vergi levhası (2026-10-12 kararı: yük sahibinde Seviye 1 = vergi levhası + yönetici onayı). Unvan ya da vergi no
 * değişince onay düşer, yeni levha yüklenir. Dosya yalnız sahibine ve yöneticiye, /panel/belgeler/<id> üzerinden açılır.
 */
async function TaxPlate({ me }: { me: Me }) {
  if (!me.company) {
    return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Vergi levhası yüklemek için önce aşağıdan firma unvanını kaydedin.</p>;
  }
  const docs = (await api<{ items: MyDocument[] }>("/documents")).items.filter((d) => d.type === "vergi_levhasi");
  const latest = docs[0];
  const status = me.company.verified
    ? "Vergi levhanız onaylandı; firmanız doğrulandı."
    : latest?.status === "bekliyor"
      ? "Vergi levhanız inceleniyor. Onaylanınca firmanız doğrulanır."
      : latest?.status === "ret"
        ? `Vergi levhanız reddedildi: ${latest.rejectReason}. Düzeltip yeniden yükleyin.`
        : latest?.status === "onay"
          ? "Unvan ya da vergi numarası değiştiği için doğrulama düştü; güncel vergi levhanızı yükleyin."
          : "Firmanızın doğrulanması (✅ rozeti) için vergi levhanızı yükleyin.";
  return (
    <section aria-labelledby="vergi-levhasi" className="space-y-3 rounded-lg border p-4">
      <h2 id="vergi-levhasi" className="font-semibold">
        Vergi levhası
      </h2>
      <p className="text-sm" data-testid="tax-plate-status">
        {status}
      </p>
      {latest && (
        <a href={`/panel/belgeler/${latest.id}`} target="_blank" rel="noopener" className="block w-fit text-sm text-primary underline-offset-4 hover:underline">
          Yüklenen belgeyi aç
        </a>
      )}
      {!me.company.verified && <TaxPlateForm replacing={latest?.status === "bekliyor"} />}
    </section>
  );
}
