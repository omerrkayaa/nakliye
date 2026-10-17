import Link from "next/link";
import type { ReactNode } from "react";
import { RETURN_PLAN_PARAMS } from "@nakliye/shared";

// Rehber yazıları (SEO). Yasal bilgiler resmî metinlerden doğrulandı (2026-10-17): Karayolu Taşıma Yönetmeliği (KTY,
// UHDGM metni + 15.05.2025 ve 16.05.2026 değişiklikleri) ve Karayolu Taşımacılık Faaliyetleri Mesleki Yeterlilik Eğitimi
// Yönetmeliği (29.01.2026'ya kadar işlenmiş). Kaynakta doğrulanamayan bilgi yazılmadı ya da "yaklaşık" diye işaretlendi.

export interface Guide {
  slug: string;
  title: string;
  description: string;
  /** Bilgilerin en son resmî kaynakla karşılaştırıldığı gün */
  checked: string;
  sources: { label: string; href: string }[];
  body: ReactNode;
}

const KTY = { label: "Karayolu Taşıma Yönetmeliği (Ulaştırma ve Altyapı Bakanlığı)", href: "https://uhdgm.uab.gov.tr/uploads/pages/yonetmelikler/kty-son.pdf" };
const KTY_2025 = { label: "KTY değişikliği, Resmî Gazete 15.05.2025, sayı 32901", href: "https://www.resmigazete.gov.tr/eskiler/2025/05/20250515-1.htm" };
const MYB = {
  label: "Karayolu Taşımacılık Faaliyetleri Mesleki Yeterlilik Eğitimi Yönetmeliği (Bakanlık)",
  href: "https://uhdgm.uab.gov.tr/uploads/pages/yonetmelikler/myb-yonetmelik.pdf",
};

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  // Metin içi bağlantı: yalnız renkle ayrılmasın (WCAG 1.4.1, axe link-in-text-block), hep altı çizili
  <Link href={href} className="text-primary underline underline-offset-4">
    {children}
  </Link>
);

export const GUIDES: Guide[] = [
  {
    slug: "nakliye-belgeleri",
    title: "Nakliyede gerekli belgeler: K belgesi, SRC ve irsaliye",
    description: "K1, K2, K3 yetki belgeleri, SRC3 ve SRC4, taşıma senedi, taşıma ve sevk irsaliyesi, U-ETDS bildirimi: yurt içi yük taşımada hangi belge ne işe yarar?",
    checked: "17 Ekim 2026",
    sources: [KTY, KTY_2025, MYB],
    body: (
      <>
        <section>
          <h2>K yetki belgesi</h2>
          <p>
            Yurt içinde eşya taşıyacak gerçek ve tüzel kişiler Ulaştırma ve Altyapı Bakanlığından K türü yetki belgesi alır (KTY madde 5 ve 6). Taşımanın şekline
            göre üç türü vardır:
          </p>
          <ul>
            <li>
              <strong>K1:</strong> başkasının yükünü ücret karşılığında, ticari amaçla taşıyanlar. Nakliyecilerin çoğu bu belgeyle çalışır.
            </li>
            <li>
              <strong>K2:</strong> ticari amaç olmadan yalnız kendi işiyle ilgili yükü taşıyanlar (hususi taşımacılık); örneğin kendi ürününü kendi aracıyla
              taşıyan üretici.
            </li>
            <li>
              <strong>K3:</strong> ev, büro ve benzeri yerlerden taşınma eşyası taşıyanlar.
            </li>
          </ul>
          <p>
            K1 için gerçek kişilerde en az 1 taşıt ve 25 ton, tüzel kişilerde en az 2 taşıt ve 50 ton asgari kapasite aranır (KTY madde 14). 2025 değişikliğiyle,
            azami yüklü ağırlığı 25 tonun altındaki tek kamyonla başvuran gerçek kişilerden bir taşıt dışında kapasite şartı aranmıyor. Yalnız kamyonetle
            çalışacaklar için de ayrı kolaylıklar var; başvurmadan önce güncel şartları oda ya da Bakanlıkla doğrulayın.
          </p>
          <p>
            Kamyonetle (N1 sınıfı) yapılan ve taşınan eşyanın ticari olmadığı taşımalar yönetmeliğin kapsamı dışındadır (KTY madde 2).
          </p>
        </section>
        <section>
          <h2>Sürücü: SRC belgesi</h2>
          <p>
            Ticari yük taşıyan sürücüden mesleki yeterlilik belgesi istenir. Yurt içi eşya ve kargo taşımacılığı için <strong>SRC4</strong>, uluslararası için{" "}
            <strong>SRC3</strong> gerekir; SRC3 sahibi SRC4&apos;ü de almış sayılır (Mesleki Yeterlilik Eğitimi Yönetmeliği madde 6 ve 7). Belge zorunluyken
            denetimde yoksa idari para cezası uygulanır (aynı yönetmelik madde 5).
          </p>
        </section>
        <section>
          <h2>Araçta bulunması gereken belgeler</h2>
          <p>Yurt içi eşya taşımasında yetki belgesi sahibinin taşıtında şunlar bulunmalıdır (KTY madde 39):</p>
          <ul>
            <li>vergi mevzuatına göre düzenlenmiş sevk irsaliyesinin iki nüshası,</li>
            <li>taşıma irsaliyesinin bir nüshası: ücret karşılığında taşıyanın, yani nakliyecinin düzenlediği belge,</li>
            <li>
              taşıma senedinin bir nüshası: gönderenle nakliyeci arasındaki sözleşme. Taşımacı, gönderen ve alıcının unvanı ve adresi, eşyanın cinsi ve
              miktarı, teslim alma ve teslim yeri, taşıma süresi ve ücreti yer alır.
            </li>
          </ul>
          <p>Bu belgelere elektronik olarak erişilebiliyorsa kâğıt nüsha şartı aranmaz. Uluslararası taşımada uluslararası geçerli belgeler kullanılır.</p>
        </section>
        <section>
          <h2>U-ETDS bildirimi</h2>
          <p>
            K1 ve K3 belgesi sahipleri, üstlendikleri taşımanın gönderici ve alıcı bilgilerini, taşıma ücreti dışındaki taşıma senedi bilgileriyle birlikte{" "}
            <strong>taşıma başlayıncaya kadar</strong> Bakanlığın U-ETDS sistemine işlemek zorundadır (KTY madde 40; 15 Mayıs 2025 değişikliği). Daha önce bu
            süre araç hareket ettikten sonra 6 saatti; eski kaynaklarda bu hâliyle geçebilir.
          </p>
        </section>
        <section>
          <h2>Platformda</h2>
          <p>
            Nakliyeciler profillerinden K belgesi, SRC, araç ruhsatı ve sigortası; yük sahipleri vergi levhası yükleyebilir. Belgeler yönetici tarafından
            incelenir ve hesabın doğrulama seviyesini belirler; diğer kullanıcılarla paylaşılmaz. Platform taşıma sözleşmesinin tarafı değildir; yukarıdaki yükümlülükler
            taraflara aittir.
          </p>
        </section>
      </>
    ),
  },
  {
    slug: "arac-tipleri",
    title: "Nakliye araç tipleri: tır, kırkayak, kamyon, kamyonet, panelvan",
    description: "Hangi yük için hangi araç? Tır, kırkayak, kamyon, kamyonet ve panelvan arasındaki fark, kasa tipleri ve yaklaşık taşıma kapasiteleri.",
    checked: "17 Ekim 2026",
    sources: [KTY],
    body: (
      <>
        <section>
          <h2>Yönetmelikte kamyon ve kamyonet</h2>
          <p>
            Karayolu Taşıma Yönetmeliği ayrımı azami yüklü ağırlığa göre yapar: izin verilen azami yüklü ağırlığı 3.500 kilogramı geçmeyen yük taşıtı{" "}
            <strong>kamyonet</strong>, geçen <strong>kamyondur</strong>. Azami yüklü ağırlık aracın kendi ağırlığını da içerir; taşınabilecek yük bundan azdır.
            Tır ve kırkayak ise sektörde kullanılan adlardır.
          </p>
        </section>
        <section>
          <h2>Araç tipleri</h2>
          <p>Aşağıdaki kapasiteler yaklaşıktır; aracın markasına, dingil sayısına ve kasasına göre değişir. Kesin değer için aracın ruhsatına bakın.</p>
          <ul>
            <li>
              <strong>Tır:</strong> çekici ve yarı römorktan oluşur. Şehirlerarası komple yüklerin aracıdır; yaklaşık 25 ton civarı yük alır.
            </li>
            <li>
              <strong>Kırkayak:</strong> dört dingilli büyük kamyon. Tırdan kısa olduğu için şehir içine ve dar yükleme alanlarına girmesi daha kolaydır.
            </li>
            <li>
              <strong>Kamyon:</strong> orta tonajlı yükler için; bölgesel dağıtımda ve kısa-orta mesafede yaygın.
            </li>
            <li>
              <strong>Kamyonet:</strong> azami yüklü ağırlığı 3.5 tonu geçmeyen hafif yük taşıtı; birkaç paletlik ya da parça yükler için.
            </li>
            <li>
              <strong>Panelvan:</strong> kapalı kasalı hafif ticari araç; koli, küçük eşya ve şehir içi dağıtım için.
            </li>
          </ul>
        </section>
        <section>
          <h2>Kasa tipleri</h2>
          <ul>
            <li>
              <strong>Tenteli:</strong> brandayla örtülü; yandan ve üstten yükleme yapılabilir, en yaygın kasa.
            </li>
            <li>
              <strong>Kapalı kasa:</strong> yağmur ve hırsızlığa karşı korumalı; arkadan yüklenir.
            </li>
            <li>
              <strong>Açık kasa:</strong> uzun ya da hacimli yükler için; yük bağlanarak taşınır.
            </li>
            <li>
              <strong>Frigo:</strong> soğutmalı; gıda ve ilaç gibi sıcaklık hassas yükler için.
            </li>
            <li>
              <strong>Damper:</strong> kasası devrilerek boşaltılır; kum, çakıl, hafriyat gibi dökme yükler için.
            </li>
            <li>
              <strong>Kayar perde:</strong> yan perdeleri kayarak açılır; yandan forkliftle hızlı yükleme için.
            </li>
            <li>
              <strong>Lowbed:</strong> alçak platformlu; iş makinesi gibi yüksek ve ağır yükler için.
            </li>
          </ul>
        </section>
        <section>
          <h2>Platformda</h2>
          <p>
            İlan verirken istediğiniz araç tipini seçersiniz. Daha büyük tipteki bir araç küçük tip isteyen ilana da uyar (tır, kamyon isteyen ilanı
            taşıyabilir); kasa tipi ve tonaj ayrıca karşılaştırılır.
          </p>
        </section>
      </>
    ),
  },
  {
    slug: "parsiyel-yuk",
    title: "Parsiyel yük nedir, ne zaman mantıklı?",
    description: "Parsiyel (kısmi) yük, komple yükle farkı, avantajları ve dikkat edilecekler; az yükünüz varsa nasıl ilan verirsiniz?",
    checked: "17 Ekim 2026",
    sources: [],
    body: (
      <>
        <section>
          <h2>Parsiyel ve komple yük</h2>
          <p>
            <strong>Komple yük</strong>, aracın tamamını tek bir göndericinin yükünün kapladığı taşımadır: araç yükü alır, doğrudan varışa gider.{" "}
            <strong>Parsiyel</strong> (kısmi) yükte ise yükünüz aracın yalnız bir kısmını doldurur; araç aynı yönde giden başka göndericilerin yükleriyle
            birlikte yola çıkar.
          </p>
        </section>
        <section>
          <h2>Ne zaman mantıklı?</h2>
          <ul>
            <li>Yükünüz bir aracı dolduracak kadar değilse: boş kalan yerin parasını ödemezsiniz.</li>
            <li>Teslim tarihi biraz esnekse: araç başka yükleri de toplayacağı için yükleme ve varış günü kayabilir.</li>
            <li>Yük kolay elleçleniyorsa: paletli ve iyi ambalajlı yükler aktarmada daha az zarar görür.</li>
          </ul>
          <p>
            Acil, kırılgan ya da özel koşul (soğuk zincir gibi) gerektiren yüklerde komple araç çoğu zaman daha güvenlidir. Nakliyeci için parsiyel yük, aracı
            doldurmanın ve özellikle dönüş yolunda boş gitmemenin bir yoludur.
          </p>
        </section>
        <section>
          <h2>Platformda</h2>
          <p>
            Ayrı bir &quot;parsiyel&quot; seçeneği yok: ilanda yükünüzün tonajını doğru yazmanız yeterli. Nakliyeciler aracının taşıyabileceğinden ağır
            yükleri görmez; hafif yükünüz uygun araçtaki nakliyecilerin hepsine görünür. Nakliyecinin dönüş yolunun üstündeki yükler{" "}
            <A href="/#donus-plani">Dönüş Planı</A>&apos;nda öne çıkar.
          </p>
        </section>
      </>
    ),
  },
  {
    slug: "nakliye-fiyati-nasil-belirlenir",
    title: "Nakliye fiyatı nasıl belirlenir?",
    description: "Mesafe, araç tipi, yakıt, otoyol ve köprü, bekleme, dönüş yükü ve sezon: taşıma ücretini belirleyen etkenler ve tahmini aralığın nasıl hesaplandığı.",
    checked: "17 Ekim 2026",
    sources: [],
    body: (
      <>
        <section>
          <h2>Ücreti belirleyen etkenler</h2>
          <ul>
            <li>
              <strong>Mesafe ve araç tipi:</strong> en büyük iki etken. Tırın kilometre başına gideri kamyonetten çok yüksektir.
            </li>
            <li>
              <strong>Yakıt:</strong> uzun yolda giderin önemli kısmı; yakıt fiyatı değiştikçe ücretler de değişir.
            </li>
            <li>
              <strong>Otoyol ve köprü ücretleri:</strong> güzergâha göre eklenir.
            </li>
            <li>
              <strong>Yükleme, boşaltma ve bekleme:</strong> uzun bekleme ya da zor yükleme koşulları ücreti artırır.
            </li>
            <li>
              <strong>Dönüş yükü ihtimali:</strong> varış noktasından dönüş yükü bulmak zorsa nakliyeci boş dönüşü de hesaba katar.
            </li>
            <li>
              <strong>Yükün türü ve tarih:</strong> soğuk zincir, tehlikeli madde ya da acil teslim ücreti artırır; hasat ve bayram öncesi gibi yoğun
              dönemlerde araç bulmak zorlaşır.
            </li>
          </ul>
        </section>
        <section>
          <h2>Tahmini aralığımız nasıl hesaplanıyor?</h2>
          <p>
            Platformdaki <A href="/fiyat">fiyat hesaplayıcı</A> henüz gerçek iş fiyatlarından değil, maliyetten hesaplar: iki il arasındaki karayolu mesafesi
            üzerinden aracın yakıt tüketimi, lastik ve bakım gideri ile şoför günlüğü toplanır, üzerine bir kâr payı aralığı eklenir. Otoyol ve köprü ücreti
            dahil değildir. Katsayılar başlangıç varsayımıdır; taşıma yapıldıkça gerçek fiyatlarla düzeltilecek.
          </p>
          <p>
            Fiyat her zaman yük sahibiyle nakliyeci arasında belirlenir; platform ödemeye aracılık etmez. Dönüş yolunda yük bulan nakliyeci boş dönmediği için
            daha uygun fiyat verebilir: Dönüş Planı, dönüş rotasından en çok {RETURN_PLAN_PARAMS.routeMaxDeviationKm} km sapan yükleri gösterir.
          </p>
        </section>
      </>
    ),
  },
];

export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug);
