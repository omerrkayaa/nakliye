import type { Metadata } from "next";
import { Suspense } from "react";
import { SETTING_KEYS, VEHICLE_TYPES } from "@nakliye/shared";
import { api } from "@/lib/api";
import { tl } from "@/lib/format";
import type { AdminSettings } from "@/lib/types";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Ayarlar" };

const timeFmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" });

/**
 * FR-54 parametre yönetimi: teyit aralıkları, eşleştirme ve koridor fiyat formülü (F7). Her değişiklik işlem kaydına
 * eski → yeni farkıyla yazılır.
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const data = await api<AdminSettings>("/admin/settings");
  return (
    <div className="max-w-3xl space-y-8">
      <p className="text-sm text-muted-foreground">
        Değişiklik hemen geçerli olur (birden çok sunucu varsa en geç 15 saniyede). Zaten sorulmuş teyitler eski aralıkla sürer; ilan bir sonraki teyidinde yeni aralığa geçer. Her değişiklik İşlem kaydı&apos;na yazılır.
      </p>
      {SETTING_KEYS.map((key) => {
        const s = data.settings[key];
        return (
          <section key={key} aria-labelledby={`ayar-${key}`} className="space-y-4 rounded-lg border p-5" data-setting={key}>
            <div className="space-y-1">
              <h2 id={`ayar-${key}`} className="text-lg font-semibold">
                {s.label}
              </h2>
              <p className="text-sm text-muted-foreground" data-testid={`setting-status-${key}`}>
                {s.isDefault ? "Varsayılan değerler kullanılıyor." : `Son değişiklik: ${s.updatedBy ?? "bilinmiyor"}${s.updatedAt ? `, ${timeFmt.format(new Date(s.updatedAt))}` : ""}`}
              </p>
            </div>
            {key === "price" && (
              <div>
                <p className="mb-2 text-sm font-medium">Şu anki değerlerle 500 km için tahmin</p>
                <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-testid="price-preview">
                  {data.pricePreview.map((p) => (
                    <li key={p.vehicleType} className="flex justify-between gap-4">
                      <span>{VEHICLE_TYPES[p.vehicleType]}</span>
                      <span className="tabular-nums">
                        {tl(p.min)} – {tl(p.max)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SettingsForm settingKey={key} value={s.value} defaults={s.defaults} isDefault={s.isDefault} />
          </section>
        );
      })}
    </div>
  );
}
