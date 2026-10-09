import type { Metadata } from "next";
import { LegalPage } from "@/components/site-chrome";

export const metadata: Metadata = { title: "İletişim" };

/** W4: iletişim (taslak). Gerçek iletişim bilgileri yayından önce eklenecek. */
export default function ContactPage() {
  return (
    <LegalPage title="İletişim" updated="9 Ekim 2026">
      <section className="space-y-2">
        <h2>Bize ulaşın</h2>
        <ul>
          <li>E-posta: [iletişim e-posta adresi]</li>
          <li>Adres: [yazışma adresi]</li>
        </ul>
        <p>KVKK kapsamındaki başvurularınızı da bu adreslere iletebilirsiniz; başvurular en geç 30 gün içinde cevaplanır.</p>
      </section>
      <section className="space-y-2">
        <h2>İlan ya da kullanıcı şikayeti</h2>
        <p>
          Sahte ilan, ulaşılamayan ilan sahibi ya da numaranın kötüye kullanılması gibi durumları yukarıdaki e-posta adresine ilanın
          bağlantısıyla bildirin; şikayetler yönetici tarafından incelenir. Uygulama içi şikayet düğmesi hazırlanıyor.
        </p>
      </section>
      <section className="space-y-2">
        <h2>Taşıma itirazı</h2>
        <p>Teslimde sorun olduysa taşıma sayfasından teslimden sonraki 48 saat içinde itiraz edin; yönetici iki tarafla görüşüp karar verir.</p>
      </section>
    </LegalPage>
  );
}
