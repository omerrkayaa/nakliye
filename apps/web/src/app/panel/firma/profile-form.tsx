"use client";

import { useActionState } from "react";
import { Field, invalid, submitWithoutReset } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProfileAction, type ProfileState } from "./actions";

type Values = { name: string; title: string; taxNo: string; taxOffice: string; address: string };

/** Alanlar kontrolsüz ama form sıfırlanmadan gönderilir: hata dönünce yazılanlar kalır. */
export function ProfileForm({ hasCompany, initial }: { hasCompany: boolean; initial: Values }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfileAction, {});
  const f = state.fields ?? {};
  return (
    <form className="space-y-6" noValidate onSubmit={submitWithoutReset(action)}>
      <input type="hidden" name="hasCompany" value={hasCompany ? "1" : "0"} />
      <Field label="Ad soyad" htmlFor="name" error={f.name}>
        <Input id="name" name="name" defaultValue={initial.name} maxLength={80} className="h-11" {...invalid("name", f.name)} />
      </Field>
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Firma</legend>
        <Field label="Firma unvanı" htmlFor="title" error={f.title} hint={hasCompany ? undefined : "Bireysel yük sahibiyseniz boş bırakın."}>
          <Input id="title" name="title" defaultValue={initial.title} maxLength={160} className="h-11" {...invalid("title", f.title)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vergi no / TC kimlik no (isteğe bağlı)" htmlFor="taxNo" error={f.taxNo}>
            <Input id="taxNo" name="taxNo" inputMode="numeric" defaultValue={initial.taxNo} maxLength={11} className="h-11" {...invalid("taxNo", f.taxNo)} />
          </Field>
          <Field label="Vergi dairesi (isteğe bağlı)" htmlFor="taxOffice" error={f.taxOffice}>
            <Input id="taxOffice" name="taxOffice" defaultValue={initial.taxOffice} maxLength={80} className="h-11" {...invalid("taxOffice", f.taxOffice)} />
          </Field>
        </div>
        <Field label="Adres (isteğe bağlı)" htmlFor="address" error={f.address}>
          <textarea
            id="address"
            name="address"
            rows={3}
            maxLength={500}
            defaultValue={initial.address}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            {...invalid("address", f.address)}
          />
        </Field>
      </fieldset>
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}
      {state.done && !pending && (
        <p role="status" className="text-sm font-medium text-emerald-700">
          Kaydedildi.
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 px-8 text-base">
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}
