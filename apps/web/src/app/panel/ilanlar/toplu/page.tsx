import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BULK_LOAD_MAX } from "@nakliye/shared";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import { BecomeShipper } from "../../become-shipper";
import { BulkUpload } from "./bulk-upload";

export const metadata: Metadata = { title: "Excel ile toplu ilan" };

/** F5 / FR-11: Excel ile toplu ilan (UC-03: dosya → önizle → yayınla). */
export default function BulkPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Excel ile toplu ilan</h1>
        <p className="text-muted-foreground">
          Şablonu indirin, her satıra bir ilan yazın (en fazla {BULK_LOAD_MAX}), dosyayı yükleyin. Yayınlamadan önce her satırı kontrol edip hataları gösteririz.
        </p>
        <a href="/panel/ilanlar/toplu/sablon" download className={buttonVariants({ variant: "outline", className: "h-11" })}>
          <Download aria-hidden /> Şablonu indir (.xlsx)
        </a>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
        <ShipperOnly />
      </Suspense>
      <p className="text-sm text-muted-foreground">
        Tek ilan için{" "}
        <Link href="/panel/ilanlar/yeni" className="text-primary underline-offset-4 hover:underline">
          formu kullanın
        </Link>
        .
      </p>
    </div>
  );
}

async function ShipperOnly() {
  const me = await api<Me>("/me");
  return me.roles.includes("shipper") ? <BulkUpload /> : <BecomeShipper />;
}
