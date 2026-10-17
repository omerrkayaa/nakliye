"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, BellRing, Clock, FileSpreadsheet, KeyRound, MapPin, Route, Scale, Smartphone, Star, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

type Audience = {
  id: "yuk-sahibi" | "nakliyeci";
  tab: string;
  lead: string;
  steps: [string, string][];
  perks: [LucideIcon, string, string][];
};

// Her madde uygulamada var olan bir özelliğe karşılık gelir (web paneli / mobil uygulama); yeni vaat eklemeden önce koda bakın.
const AUDIENCES: Audience[] = [
  {
    id: "yuk-sahibi",
    tab: "Yük sahibiyim",
    lead: "İlanınızı tek ekranda verin, gelen teklifleri nakliyecinin puanı ve iş geçmişiyle yan yana görün.",
    steps: [
      ["İlan verin", "Nereden, nereye, ne zaman ve hangi araç: tek ekran."],
      ["Teklifleri karşılaştırın", "Fiyat, puan, tamamlanan iş ve araç yan yana; birini kabul edin."],
      ["Teslimi kodla onaylayın", "Kod alıcıda; nakliyeci kodu girince taşıma tamamlanır."],
    ],
    perks: [
      [Scale, "Tahmini piyasa aralığı", "İlan verirken güzergâhın karayolu mesafesine göre bir fiyat aralığı görürsünüz."],
      [Star, "Nakliyecilerim", "Çalıştığınız nakliyeciyi favorilere ekleyin; yeni ilanınız ona bildirilir."],
      [FileSpreadsheet, "Excel ile toplu ilan", "Çok yük veriyorsanız şablonu doldurup tek seferde yayınlayın."],
      [KeyRound, "Kodla teslim", "Yük, alıcının verdiği 6 haneli kod girilmeden teslim edilmiş sayılmaz."],
    ],
  },
  {
    id: "nakliyeci",
    tab: "Nakliyeciyim",
    lead: "Bayat ilanla vakit kaybetmeyin; dönüş yolunuzun üstündeki teyitli yükler önünüze gelsin.",
    steps: [
      ["Yükleri görün", "Yalnız teyitli ilanlar; yakınınızdaki ve rotanızdaki yükler önde."],
      ["Arayın ya da teklif verin", "Numara tek dokunuşla açılır; teklifiniz yük sahibine anında gider."],
      ["Boş dönüşü bildirin", "Aracınız nerede boşalıyor? Uyan yük çıkınca bildirim gelir."],
    ],
    perks: [
      [Route, "Dönüş Planı", "Süren işinizin dönüş yoluna uyan yükler sıralanır: rotadan en çok 30 km sapanlar."],
      [BellRing, "Rota alarmı", "Sık gittiğiniz güzergâhı kaydedin; uyan yük çıkınca bildirim gelir."],
      [MapPin, "Yakınımdakiler", "Bulunduğunuz yerin çevresindeki yükler, teyitliler önde, yakından uzağa sıralanır."],
      [Clock, "Bayat ilan yok", "Sahibi “hâlâ geçerli” demeyen ilan listeden düşer."],
    ],
  },
];

/** Tanıtım sayfası "Nasıl çalışır": iki kitleye ayrı anlatım (sekme). #nakliyeci / #yuk-sahibi bağlantısı ilgili sekmeyi açar. */
export function AudienceTabs() {
  const [active, setActive] = useState<Audience["id"]>("yuk-sahibi");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (id !== "nakliyeci" && id !== "yuk-sahibi") return;
      setActive(id);
      document.getElementById("nasil-calisir")?.scrollIntoView(); // bu adla bir öğe yok, tarayıcı kendisi kaydırmaz
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  // WAI-ARIA sekme deseni: ok tuşları sekmeler arasında gezer ve seçer
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? AUDIENCES.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + AUDIENCES.length) % AUDIENCES.length;
    setActive(AUDIENCES[j]!.id);
    tabs.current[j]?.focus();
  };

  return (
    <div className="space-y-8">
      <div role="tablist" aria-label="Kimsiniz?" className="inline-flex rounded-xl border bg-muted/50 p-1">
        {AUDIENCES.map((a, i) => (
          <button
            key={a.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={`sekme-${a.id}`}
            type="button"
            role="tab"
            aria-selected={active === a.id}
            aria-controls={`panel-${a.id}`}
            tabIndex={active === a.id ? 0 : -1}
            onClick={() => setActive(a.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "h-11 rounded-lg px-5 text-sm font-semibold transition-colors",
              active === a.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {a.tab}
          </button>
        ))}
      </div>

      {AUDIENCES.map((a) => (
        <div key={a.id} id={`panel-${a.id}`} role="tabpanel" aria-labelledby={`sekme-${a.id}`} hidden={active !== a.id} className="space-y-8">
          <p className="max-w-2xl text-lg">{a.lead}</p>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <ol className="space-y-5">
              {a.steps.map(([head, text], i) => (
                <li key={head} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{head}</p>
                    <p className="text-sm text-muted-foreground">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <ul className="grid gap-3 sm:grid-cols-2">
              {a.perks.map(([Icon, title, text]) => (
                <li key={title} className="space-y-1.5 rounded-lg border bg-card p-4">
                  <p className="flex items-center gap-2 font-semibold">
                    <Icon className="size-5 text-brand-accent" aria-hidden /> {title}
                  </p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </li>
              ))}
            </ul>
          </div>
          {a.id === "yuk-sahibi" ? (
            <Link href="/panel/ilanlar/yeni" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
              İlan ver <ArrowRight aria-hidden />
            </Link>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="#donus-plani" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
                Dönüş Planı nasıl çalışır <ArrowRight aria-hidden />
              </Link>
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="size-4" aria-hidden /> Android uygulaması yakında
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
