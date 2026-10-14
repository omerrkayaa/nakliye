"use client";

import { DOCUMENT_LIMITS } from "@nakliye/shared";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { uploadTaxPlateAction, type UploadState } from "./actions";

const MB = DOCUMENT_LIMITS.maxBytes / 1024 / 1024;

/** Vergi levhası yükleme. Büyük dosya gönderilmeden yakalanır (proxy sınırına takılıp yarım gitmesin). */
export function TaxPlateForm({ replacing }: { replacing: boolean }) {
  const [state, dispatch, pending] = useActionState<UploadState, FormData>(uploadTaxPlateAction, {});
  const [tooBig, setTooBig] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const file = data.get("file");
    setTooBig(file instanceof File && file.size > DOCUMENT_LIMITS.maxBytes);
    if (file instanceof File && file.size > DOCUMENT_LIMITS.maxBytes) return;
    startTransition(() => dispatch(data));
  };
  const error = tooBig ? `Dosya en çok ${MB} MB olabilir` : state.error;
  return (
    <form onSubmit={submit} className="space-y-2">
      <Field label={`${replacing ? "İncelemedekinin yerine yeni dosya" : "Vergi levhası"} (PDF, JPEG ya da PNG; en çok ${MB} MB)`} htmlFor="tax-plate">
        <input
          id="tax-plate"
          name="file"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png"
          className="block w-full text-sm file:mr-3 file:h-11 file:rounded-lg file:border file:border-input file:bg-background file:px-4 file:font-medium"
        />
      </Field>
      <Button type="submit" disabled={pending} className="h-11">
        {pending ? "Yükleniyor…" : "Vergi levhasını yükle"}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {state.done && !pending && !error && (
        <p role="status" className="text-sm">
          Yüklendi; yönetici incelemesinden sonra firmanız doğrulanır.
        </p>
      )}
    </form>
  );
}
