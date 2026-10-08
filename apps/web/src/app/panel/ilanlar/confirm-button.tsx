"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { confirmLoadAction, type FormState } from "./actions";

/** Satırdaki "Hâlâ geçerli" düğmesi; hata (ör. tarih geçmiş) satırın altında gösterilir. */
export function ConfirmButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmLoadAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Hâlâ geçerli"}
      </Button>
      {state.error && (
        <span role="alert" className="max-w-56 text-right text-xs text-destructive">
          {state.error}
        </span>
      )}
    </form>
  );
}
