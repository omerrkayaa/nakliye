"use client";

import { useActionState, useEffect, useState } from "react";
import { BODY_TYPES, CARGO_TYPES, VEHICLE_TYPES } from "@nakliye/shared";
import { Field, invalid, selectClass, submitWithoutReset } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Province } from "@/lib/types";
import { tl } from "@/lib/format";
import { createLoadAction, estimatePriceAction, type FormState, type PriceEstimate } from "../actions";

const options = (o: Record<string, string>) =>
  Object.entries(o).map(([v, label]) => (
    <option key={v} value={v}>
      {label}
    </option>
  ));

/** İl → ilçe seçimi (ilçe kimliği gönderilir). */
function PlacePicker({
  id,
  label,
  provinces,
  error,
  initial,
  onDistrict,
}: {
  id: string;
  label: string;
  provinces: Province[];
  error?: string;
  initial?: Spot;
  onDistrict: (districtId: string) => void;
}) {
  const [province, setProvince] = useState(initial ? String(initial.provinceId) : "");
  const [district, setDistrict] = useState(initial ? String(initial.districtId) : "");
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
            onDistrict("");
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
        <select
          id={id}
          name={id}
          className={selectClass}
          value={district}
          onChange={(e) => {
            setDistrict(e.target.value);
            onDistrict(e.target.value);
          }}
          disabled={!province}
          {...invalid(id, error)}
        >
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

type Spot = { provinceId: number; districtId: number };
type Values = { loadFrom: string; loadTo: string; cargoType: string; weightTon: string; vehicleType: string; bodyType: string; priceType: string; price: string; note: string };
/** "Benzerini yayınla": eski ilandan doldurulan başlangıç değerleri */
export type LoadDraft = Partial<Values> & { origin?: Spot; dest?: Spot };

/** P3 ilan oluştur. Alanlar kontrollü ve form sıfırlanmadan gönderilir: hata dönünce girilenler kaybolmaz. */
export function NewLoadForm({ provinces, today, maxDay, draft }: { provinces: Province[]; today: string; maxDay: string; draft?: LoadDraft }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createLoadAction, {});
  const { origin, dest, ...draftValues } = draft ?? {};
  const [v, setV] = useState<Values>({ loadFrom: today, loadTo: today, cargoType: "", weightTon: "", vehicleType: "", bodyType: "", priceType: "teklif", price: "", note: "", ...draftValues });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const f = state.fields ?? {};
  // F7: kalkış, varış ve araç seçilince tahmini fiyat aralığı
  const [route, setRoute] = useState({ from: origin ? String(origin.districtId) : "", to: dest ? String(dest.districtId) : "" });
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  useEffect(() => {
    let live = true;
    if (route.from && route.to && v.vehicleType) {
      void estimatePriceAction(Number(route.from), Number(route.to), v.vehicleType).then((e) => live && setEstimate(e));
    }
    return () => {
      live = false;
    };
  }, [route.from, route.to, v.vehicleType]);
  const shownEstimate = route.from && route.to && v.vehicleType ? estimate : null;

  return (
    <form className="space-y-8" noValidate onSubmit={submitWithoutReset(action)}>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Güzergâh</h2>
        <PlacePicker id="originDistrictId" label="Kalkış" provinces={provinces} error={f.originDistrictId} initial={origin} onDistrict={(d) => setRoute((r) => ({ ...r, from: d }))} />
        <PlacePicker id="destDistrictId" label="Varış" provinces={provinces} error={f.destDistrictId} initial={dest} onDistrict={(d) => setRoute((r) => ({ ...r, to: d }))} />
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
        {shownEstimate && (
          <p data-testid="price-estimate" className="rounded-lg border bg-muted/40 p-3 text-sm">
            Bu güzergâhta tahmini fiyat aralığı:{" "}
            <strong className="font-semibold">
              {tl(shownEstimate.min)} – {tl(shownEstimate.max)}
            </strong>
            <span className="text-muted-foreground">
              {" "}
              (yaklaşık {shownEstimate.distanceKm} km; yakıt, şoför ve araç gideri üzerinden, otoyol/köprü hariç)
            </span>
          </p>
        )}
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
