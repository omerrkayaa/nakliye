import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { phoneText } from "@/lib/format";
import type { Me } from "@/lib/types";
import { DeleteAccount } from "./delete-account";

export const metadata: Metadata = { title: "Hesap ve veriler" };

/** FR-07 (KVKK md. 11): kişisel verileri indirme ve hesabı silme. Her rol için. */
export default function AccountPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Hesap ve veriler</h1>
        <p className="text-muted-foreground">
          Kişisel verileriniz üzerindeki haklarınız için{" "}
          <Link href="/kvkk" className="text-primary underline-offset-4 hover:underline">
            aydınlatma metnine
          </Link>{" "}
          bakın.
        </p>
      </div>

      <section aria-labelledby="veriler" className="space-y-3 rounded-lg border p-5">
        <h2 id="veriler" className="text-lg font-semibold">
          Verilerimi indir
        </h2>
        <p className="text-sm">
          Profiliniz, firma bilgileriniz, araçlarınız, ilanlarınız, teklifleriniz, taşımalarınız, verdiğiniz ve görünür hâle gelmiş aldığınız puanlar,
          bildirimleriniz ve oturum kayıtlarınız tek bir JSON dosyasında. Karşı tarafların telefon numaraları dosyada yer almaz.
        </p>
        <a href="/panel/hesap/veriler" download className={buttonVariants({ variant: "outline", className: "h-11 px-4" })}>
          <Download aria-hidden /> Verilerimi indir (JSON)
        </a>
      </section>

      <section aria-labelledby="sil" className="space-y-4 rounded-lg border border-destructive/40 p-5">
        <h2 id="sil" className="text-lg font-semibold text-destructive">
          Hesabımı sil
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Telefon numaranız, adınız, firma bilgileriniz, araç plakalarınız, bildirimleriniz ve rota alarmlarınız silinir.</li>
          <li>Yayındaki ilanlarınız ve boş araç ilanlarınız kapanır; bekleyen teklifleriniz geri çekilir.</li>
          <li>Tamamlanmış taşımalar ve verdiğiniz puanlar karşı tarafın geçmişi için “Silinmiş kullanıcı” adıyla kalır; yazdığınız notlar ve yorumlar silinir.</li>
          <li>Süren bir taşımanız varken hesabınız silinemez.</li>
          <li>
            <strong>Bu işlem geri alınamaz.</strong> Aynı numarayla yeniden giriş yaparsanız yeni, boş bir hesap açılır.
          </li>
        </ul>
        <Suspense fallback={null}>
          <Delete />
        </Suspense>
      </section>
    </div>
  );
}

async function Delete() {
  const me = await api<Me>("/me");
  return <DeleteAccount phone={phoneText(me.phone)} />;
}
