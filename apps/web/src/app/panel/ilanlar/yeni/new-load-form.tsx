"use client";

import { startTransition, useActionState, useState } from "react";
import { BODY_TYPES, CARGO_TYPES, VEHICLE_TYPES } from "@nakliye/shared";
import { Field, invalid, selectClass } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Province } from "@/lib/types";
import { createLoadAction, type FormState } from "../actions";

const options = (o: Record<string, string>) =>
  Object.entries(o).map(([v, label]) => (
    <option key={v} value={v}>
      {label}
    </option>
  ));

/** İl → ilçe seçimi (ilçe kimliği gönderilir). */
function PlacePicker({ id, label, provinces, error }: { id: string; label: string; provinces: Province[]; error?: string }) {
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const districts = provinces.find((p) => String(p.id) === province)?.districts ?? [];
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">{label}</legend>
      <Field label={`${label} ili`} htmlFor={`${id}-il`}>
        <select
          id={`${id}-il`}
          className={selectClass}
          value={province}
          onChange={(e) => {
            setProvince(e.target.value);
            setDistrict("");
          }}
        >
          <option value="">İl seçin</option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`${label} ilçesi`} htmlFor={id} error={error}>
        <select id={id} name={id} className={selectClass} value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!province} {...invalid(id, error)}>
          <option value="">{province ? "İlçe seçin" : "Önce il seçin"}</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
    </fieldset>
  );
}

/**
 * P3 ilan oluştur. Alanlar kontrollü: hata dönünce girilenler kaybolmaz.
 * <form action> işlem bitince formu sıfırlıyor; kontrollü <select> DOM'da sıfırlanıp state'le uyumsuz kalıyordu
 * (ilçe boş görünüyor, tekrar gönderimde boş gidiyordu — testte yakalandı). Bu yüzden gönderim onSubmit'te elle.
 */
export function NewLoadForm({ provinces, today, maxDay }: { provinces: Province[]; today: string; maxDay: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createLoadAction, {});
  const [v, setV] = useState({ loadFrom: today, loadTo: today, cargoType: "", weightTon: "", vehicleType: "", bodyType: "", priceType: "teklif", price: "", note: "" });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const f = state.fields ?? {};

  return (
    <form
      className="space-y-8"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Güzergâh</h2>
        <PlacePicker id="originDistrictId" label="Kalkış" provinces={provinces} error={f.originDistrictId} />
        <PlacePicker id="destDistrictId" label="Varış" provinces={provinces} error={f.destDistrictId} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Yükleme tarihi</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="En erken" htmlFor="loadFrom" error={f.loadFrom}>
            <Input id="loadFrom" name="loadFrom" type="date" min={today} max={maxDay} value={v.loadFrom} onChange={set("loadFrom")} className="h-11" {...invalid("loadFrom", f.loadFrom)} />
          </Field>
          <Field label="En geç" htmlFor="loadTo" error={f.loadTo}>
            <Input id="loadTo" name="loadTo" type="date" min={v.loadFrom || today} max={maxDay} value={v.loadTo} onChange={set("loadTo")} className="h-11" {...invalid("loadTo", f.loadTo)} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Yük ve araç</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Yük cinsi" htmlFor="cargoType" error={f.cargoType}>
            <select id="cargoType" name="cargoType" className={selectClass} value={v.cargoType} onChange={set("cargoType")} {...invalid("cargoType", f.cargoType)}>
              <option value="">Seçin</option>
              {options(CARGO_TYPES)}
            </select>
          </Field>
          <Field label="Ağırlık (ton)" htmlFor="weightTon" error={f.weightTon}>
            <Input id="weightTon" name="weightTon" inputMode="decimal" placeholder="Örn. 12" value={v.weightTon} onChange={set("weightTon")} className="h-11" {...invalid("weightTon", f.weightTon)} />
          </Field>
          <Field label="Araç tipi" htmlFor="vehicleType" error={f.vehicleType}>
            <select id="vehicleType" name="vehicleType" className={selectClass} value={v.vehicleType} onChange={set("vehicleType")} {...invalid("vehicleType", f.vehicleType)}>
              <option value="">Seçin</option>
              {options(VEHICLE_TYPES)}
            </select>
          </Field>
          <Field label="Kasa tipi" htmlFor="bodyType" error={f.bodyType}>
            <select id="bodyType" name="bodyType" className={selectClass} value={v.bodyType} onChange={set("bodyType")}>
              <option value="">Farketmez</option>
              {options(BODY_TYPES)}
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Fiyat</h2>
        <div role="radiogroup" aria-label="Fiyat türü" className="flex flex-wrap gap-6">
          {[
            ["teklif", "Teklif alayım"],
            ["sabit", "Sabit fiyat veriyorum"],
          ].map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="priceType" value={value} checked={v.priceType === value} onChange={set("priceType")} className="size-4 accent-primary" />
              {label}
            </label>
          ))}
        </div>
        {v.priceType === "sabit" && (
          <div className="max-w-xs">
            <Field label="Tutar (₺, KDV hariç)" htmlFor="price" error={f.price}>
              <Input id="price" name="price" inputMode="numeric" placeholder="Örn. 18000" value={v.price} onChange={set("price")} className="h-11" {...invalid("price", f.price)} />
            </Field>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <Field label="Not (isteğe bağlı)" htmlFor="note" error={f.note} hint="Örn. forklift var, rampa yok. Telefon numarası yazmayın: nakliyeciler sizi 'Ara' düğmesiyle arar.">
          <textarea
            id="note"
            name="note"
            maxLength={280}
            rows={3}
            value={v.note}
            onChange={set("note")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Field>
      </section>

      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 px-8 text-base">
        {pending ? "Yayınlanıyor…" : "İlanı yayınla"}
      </Button>
    </form>
  );
}
