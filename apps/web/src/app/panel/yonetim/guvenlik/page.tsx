import type { Metadata } from "next";
import { api } from "@/lib/api";
import type { TotpStatus } from "@/lib/types";
import { RegenerateCodes, TotpSetup } from "./totp-setup";

export const metadata: Metadata = { title: "Güvenlik" };

const dateFmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" });

/** NFR-04 yönetici iki adımlı doğrulaması: durum, kurtarma kodları, telefon değiştirme (yerleşim kurulumu zorunlu kılar) */
export default async function SecurityPage() {
  const s = await api<TotpStatus>("/me/totp");
  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">İki adımlı doğrulama</h2>
        <p data-testid="totp-status">
          <strong>Açık</strong>
          {s.enabledAt && ` · ${dateFmt.format(new Date(s.enabledAt))} tarihinde kuruldu`}
        </p>
        <p className="text-sm text-muted-foreground">Girişte SMS kodundan sonra doğrulama uygulamasındaki kod istenir. Yönetici oturumu 12 saat sürer; sonra yeniden giriş gerekir.</p>
        <p data-testid="recovery-left">
          Kalan kurtarma kodu: <strong>{s.recoveryCodesLeft}</strong> / 10
          {s.recoveryCodesLeft <= 3 && <span className="text-destructive"> — azaldı, yenilerini üretin.</span>}
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Yeni kurtarma kodları</h2>
        <p className="text-sm text-muted-foreground">Yeni kodlar üretilince eskileri geçersiz olur.</p>
        <RegenerateCodes />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Telefon değiştirme</h2>
        <p className="text-sm text-muted-foreground">Yeni telefondaki uygulamayı onaylayana kadar mevcut uygulama çalışmaya devam eder. Onaydan sonra diğer oturumlar kapanır ve yeni kurtarma kodları verilir.</p>
        <TotpSetup changing />
      </section>
    </div>
  );
}
