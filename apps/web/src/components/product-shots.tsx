import Image, { type StaticImageData } from "next/image";
import panelOffers from "../../public/ekran/panel-teklifler.png";
import mobileFeed from "../../public/ekran/mobil-yuk-akisi.png";
import mobileDetail from "../../public/ekran/mobil-yuk-detayi.png";

/** Tanıtım sayfası: panelin ve uygulamanın gerçek ekranları (demo verisiyle; `npm run db:seed-demo`). */
export function ProductShots() {
  return (
    <section aria-labelledby="ekranlar" className="border-t">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-14">
        <div className="max-w-2xl space-y-2">
          <h2 id="ekranlar" className="text-2xl font-bold">
            Panel ve uygulama
          </h2>
          <p className="text-muted-foreground">Uygulamanın kendi ekranları; içerik demo verisidir.</p>
        </div>
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
          <figure className="space-y-3">
            <div className="overflow-hidden rounded-xl border bg-background shadow-lg shadow-primary/5">
              <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3 py-2" aria-hidden>
                <span className="size-2.5 rounded-full bg-border" />
                <span className="size-2.5 rounded-full bg-border" />
                <span className="size-2.5 rounded-full bg-border" />
              </div>
              <Image
                src={panelOffers}
                alt="Yük sahibi panelinde ilan detayı: Efeler'den Bağcılar'a 18 ton genel kargo ilanına gelen 26.500 ₺'lik teklif; nakliyecinin puanı, tamamlanmış iş sayısı, aracı ve Kabul et düğmesi."
                sizes="(min-width: 1024px) 600px, 100vw"
                placeholder="blur"
              />
            </div>
            <figcaption className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Yük sahibi (web paneli):</span> teklifler fiyat, puan, tamamlanmış iş ve araçla yan yana; tek tıkla
              kabul.
            </figcaption>
          </figure>
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            <Phone
              src={mobileFeed}
              alt="Nakliyeci uygulamasında yük akışı: Kemalpaşa'dan Pendik'e ve Arnavutköy'den Bornova'ya teyitli ilanlar, Ara ve Teklif ver düğmeleri."
              caption="Nakliyeci uygulaması: yalnız teyitli ilanlar; Ara ya da Teklif ver."
            />
            <Phone
              src={mobileDetail}
              alt="Nakliyeci uygulamasında yük detayı: güzergâh, yükleme tarihi, yük sahibi, Ara düğmesi ve tahmini piyasa aralığıyla teklif formu."
              caption="Yük detayı: tahmini piyasa aralığıyla teklif."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Phone({ src, alt, caption }: { src: StaticImageData; alt: string; caption: string }) {
  return (
    <figure className="space-y-3">
      <div className="overflow-hidden rounded-[1.75rem] border-[5px] border-primary bg-primary shadow-lg shadow-primary/10">
        <Image src={src} alt={alt} sizes="(min-width: 1024px) 180px, 45vw" placeholder="blur" className="rounded-[1.4rem]" />
      </div>
      <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
