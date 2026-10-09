import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Truck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Giriş" };

export default function LoginPage({ searchParams }: PageProps<"/giris">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Truck className="size-6" aria-hidden />
            <span className="font-bold">Nakliye</span>
          </div>
          <h1 className="text-xl leading-snug font-semibold">Yük sahibi paneli</h1>
          <CardDescription>Telefon numaranıza gelen SMS koduyla giriş yapın. Şifre yok.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <Form searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/giris">, "searchParams">) {
  const { sonra, oturum } = await searchParams;
  return (
    <>
      {oturum && <p className="mb-4 rounded-md bg-muted p-3 text-sm">Oturumunuz sona erdi; lütfen tekrar giriş yapın.</p>}
      <LoginForm next={typeof sonra === "string" ? sonra : "/panel"} />
      <p className="mt-4 text-xs text-muted-foreground">
        Giriş yaparak{" "}
        <Link href="/kullanim-sartlari" className="underline underline-offset-2">
          kullanım şartlarını
        </Link>{" "}
        kabul etmiş ve{" "}
        <Link href="/kvkk" className="underline underline-offset-2">
          KVKK aydınlatma metnini
        </Link>{" "}
        okumuş olursunuz.
      </p>
    </>
  );
}
