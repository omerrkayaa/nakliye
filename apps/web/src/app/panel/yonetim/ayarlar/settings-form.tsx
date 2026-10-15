"use client";

import { VEHICLE_TYPES, type SettingKey, type VehicleType } from "@nakliye/shared";
import { useActionState, useEffect, useRef } from "react";
import { Field, invalid, selectClass, submitWithoutReset } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetSettingsAction, saveSettingsAction, type SettingsState } from "./actions";

/** Alan: yol (iç içe nesnede), etiket, birim, açıklama */
interface Spec {
  path: string;
  label: string;
  unit?: string;
  hint?: string;
}

const SPECS: Record<Exclude<SettingKey, "price">, Spec[]> = {
  confirmation: [
    { path: "reminderIntervalH", label: "Teyit aralığı", unit: "saat", hint: "İlan sahibine bu sıklıkla “Hâlâ geçerli mi?” sorulur (BR-02)." },
    { path: "loadDayIntervalH", label: "Yükleme günü aralığı", unit: "saat", hint: "Yükleme günü daha sık sorulur." },
    { path: "answerWindowH", label: "Cevap süresi", unit: "saat", hint: "Cevapsız kalırsa ilan “teyit bekliyor”a düşer (BR-03)." },
    { path: "pendingGraceH", label: "“Teyit bekliyor” süresi", unit: "saat", hint: "Bu süre de geçerse ilan yayından kalkar (BR-04)." },
    { path: "smsFallbackMin", label: "SMS yedeği", unit: "dakika", hint: "Bildirim açılmazsa bu süre sonra SMS gider; cevap süresinden kısa olmalı." },
    { path: "reportThreshold", label: "Anında teyit için şikayet", unit: "kişi", hint: "“Yük yok” diyen bu kadar farklı sayılan şikayetçi olunca hemen sorulur (BR-05)." },
  ],
  matching: [
    { path: "originRadiusKm", label: "Kalkış yarıçapı", unit: "km", hint: "Boş aracın bulunduğu yer ile yükün kalkışı arası en çok (BR-20)." },
    { path: "destRadiusKm", label: "Varış yarıçapı", unit: "km" },
    { path: "dateToleranceDays", label: "Tarih toleransı", unit: "gün", hint: "Uygunluk tarihleri arasında bu kadar gün oynama." },
    { path: "weights.originProximity", label: "Ağırlık: kalkış yakınlığı" },
    { path: "weights.destProximity", label: "Ağırlık: varış yakınlığı" },
    { path: "weights.dateFit", label: "Ağırlık: tarih uyumu" },
    { path: "weights.capacityFill", label: "Ağırlık: kapasite doluluğu" },
    { path: "weights.trust", label: "Ağırlık: güven skoru", hint: "Beş ağırlığın toplamı 1 olmalı (BR-21)." },
  ],
};

const VEHICLE_FIELDS: Spec[] = [
  { path: "fuelLitersPer100Km", label: "Yakıt", unit: "L/100 km" },
  { path: "wearPerKm", label: "Aşınma, bakım", unit: "₺/km" },
  { path: "driverDaily", label: "Şoför", unit: "₺/gün" },
];

const at = (obj: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
/** Alana yazılan değer: ondalık virgülle, binlik ayırıcı YOK ("3.000" geri okunurken 3 olurdu) */
const show = (v: unknown) => (typeof v === "number" ? v.toLocaleString("tr-TR", { maximumFractionDigits: 4, useGrouping: false }) : String(v ?? ""));
/** İpucundaki varsayılan: okunur (binlik ayırıcılı) */
const pretty = (v: unknown) => (typeof v === "number" ? v.toLocaleString("tr-TR", { maximumFractionDigits: 4 }) : String(v ?? ""));
const fid = (key: string, path: string) => `${key}-${path.replace(/\./g, "-")}`;

/** Bir ayar grubunun formu: değerler, varsayılan ipucu, kaydet ve varsayılana dön */
export function SettingsForm({ settingKey, value, defaults, isDefault }: { settingKey: SettingKey; value: unknown; defaults: unknown; isDefault: boolean }) {
  const [state, save, saving] = useActionState<SettingsState, FormData>(saveSettingsAction, {});
  const [resetState, reset, resetting] = useActionState<SettingsState, FormData>(resetSettingsAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Varsayılana dönünce alanlar varsayılanla dolsun (alanlar denetimsiz: yeni defaultValue ekrandakini değiştirmez;
  // formu yeniden kurmak da "Kaydedildi" durumunu silerdi)
  useEffect(() => {
    if (!resetState.done || !formRef.current) return;
    for (const el of Array.from(formRef.current.elements)) {
      const input = el as HTMLInputElement | HTMLSelectElement;
      if (!input.name || input.name === "key") continue;
      const d = at(defaults, input.name);
      if (d !== undefined) input.value = input instanceof HTMLSelectElement ? String(d) : show(d);
    }
  }, [resetState, defaults]);
  const error = state.fields?.[""] ?? (state.fields && Object.keys(state.fields).length ? undefined : state.error);
  const field = (s: Spec) => {
    const id = fid(settingKey, s.path);
    const err = state.fields?.[s.path];
    return (
      <Field key={s.path} label={`${s.label}${s.unit ? ` (${s.unit})` : ""}`} htmlFor={id} error={err} hint={`${s.hint ? `${s.hint} ` : ""}Varsayılan: ${pretty(at(defaults, s.path))}`}>
        <Input id={id} name={s.path} inputMode="decimal" defaultValue={show(at(value, s.path))} required className="h-11 max-w-40" {...invalid(id, err)} />
      </Field>
    );
  };

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={submitWithoutReset(save)} className="space-y-4" aria-label={`${settingKey} ayarları`}>
        <input type="hidden" name="key" value={settingKey} />
        {settingKey === "price" ? (
          <PriceFields value={value} defaults={defaults} state={state} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">{SPECS[settingKey].map(field)}</div>
        )}
        {/* Nesne düzeyindeki hata (ör. ağırlık toplamı) belirli bir alana bağlı değil */}
        {state.fields?.weights && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.fields.weights}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="h-11" disabled={saving}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
          {state.done && !saving && !resetState.done && (
            <p role="status" className="text-sm">
              Kaydedildi.
            </p>
          )}
          {resetState.done && !resetting && (
            <p role="status" className="text-sm">
              Varsayılana döndürüldü.
            </p>
          )}
        </div>
      </form>
      {!isDefault && (
        <form
          action={reset}
          onSubmit={(e) => {
            if (!window.confirm("Bu gruptaki tüm değerler varsayılana dönsün mü?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="key" value={settingKey} />
          <Button type="submit" variant="outline" className="h-10" disabled={resetting}>
            Varsayılana döndür
          </Button>
          {resetState.error && <p className="text-sm text-destructive">{resetState.error}</p>}
        </form>
      )}
    </div>
  );
}

function PriceFields({ value, defaults, state }: { value: unknown; defaults: unknown; state: SettingsState }) {
  const general: Spec[] = [
    { path: "fuelPricePerLiter", label: "Motorin fiyatı", unit: "₺/L" },
    { path: "kmPerDay", label: "Günlük yol", unit: "km", hint: "Şoför gün sayısı mesafe ÷ bu değer." },
    { path: "marginMin", label: "Kâr çarpanı (alt)", hint: "Maliyet × çarpan = aralığın alt ucu." },
    { path: "marginMax", label: "Kâr çarpanı (üst)" },
  ];
  const input = (s: Spec, path = s.path, label = `${s.label}${s.unit ? ` (${s.unit})` : ""}`) => {
    const id = fid("price", path);
    const err = state.fields?.[path];
    return (
      <Field key={path} label={label} htmlFor={id} error={err} hint={`${s.hint ? `${s.hint} ` : ""}Varsayılan: ${pretty(at(defaults, path))}`}>
        <Input id={id} name={path} inputMode="decimal" defaultValue={show(at(value, path))} required className="h-11 max-w-40" {...invalid(id, err)} />
      </Field>
    );
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {general.map((s) => input(s))}
        <Field label="Yuvarlama (₺)" htmlFor="price-roundTo" error={state.fields?.roundTo} hint={`Varsayılan: ${pretty(at(defaults, "roundTo"))}`}>
          <select id="price-roundTo" name="roundTo" defaultValue={String(at(value, "roundTo"))} className={`${selectClass} max-w-40`}>
            {[50, 100, 250, 500, 1000].map((v) => (
              <option key={v} value={v}>
                {v.toLocaleString("tr-TR")}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="space-y-3">
        <legend className="font-medium">Araç tipine göre maliyet</legend>
        {(Object.keys(VEHICLE_TYPES) as VehicleType[]).map((t) => (
          <div key={t} className="rounded-lg border p-3">
            <p className="mb-2 font-medium">{VEHICLE_TYPES[t]}</p>
            <div className="grid gap-3 sm:grid-cols-3">{VEHICLE_FIELDS.map((s) => input(s, `vehicles.${t}.${s.path}`, `${s.label} (${s.unit})`))}</div>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
