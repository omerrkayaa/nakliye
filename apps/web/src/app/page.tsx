import Link from "next/link";
import { ArrowRight, Truck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// W1 ana sayfanın yer tutucusu: değer önerisi ve panele giriş (tam landing Faz 3'te)
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex items-center gap-2 text-primary">
        <Truck className="size-8" aria-hidden />
        <span className="text-2xl font-bold">Nakliye</span>
      </div>
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-balance">Gördüğün her yük gerçek ve şu an geçerli.</h1>
        <p className="text-lg text-muted-foreground">
          İlanlar düzenli olarak sahibine teyit ettirilir; bayat ilan listede kalmaz. Yükünüzü doğrulanmış nakliyecilere
          ulaştırın, teklifleri tek ekranda karşılaştırın.
        </p>
      </div>
      <div>
        <Link href="/panel" className={buttonVariants({ size: "lg", className: "h-12 px-6 text-base" })}>
          Yük sahibiyim, panele gir <ArrowRight aria-hidden />
        </Link>
      </div>
    </main>
  );
}
