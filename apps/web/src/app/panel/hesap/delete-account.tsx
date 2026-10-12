"use client";

import { useActionState } from "react";
import { Field, invalid, submitWithoutReset } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteAccountAction, requestDeletionCodeAction, type DeletionState } from "./actions";

/** İki adım: kod iste (hesabın numarasına SMS) → kodu gir ve onayla. Geri alınamaz işlem kodla yeniden doğrulanır. */
export function DeleteAccount({ phone }: { phone: string }) {
  const [codeState, requestCode, sending] = useActionState<DeletionState, FormData>(requestDeletionCodeAction, {});
  const [state, remove, removing] = useActionState<DeletionState, FormData>(deleteAccountAction, {});
  const ask = (e: React.MouseEvent) => {
    if (!window.confirm("Hesabınız kalıcı olarak silinsin mi? Bu işlem geri alınamaz.")) e.preventDefault();
  };
  return (
    <div className="space-y-4">
      <form action={requestCode} className="space-y-2">
        <Button type="submit" variant="outline" className="h-11" disabled={sending}>
          {codeState.sent ? "Kodu yeniden gönder" : "Silme kodu gönder"}
        </Button>
        {codeState.sent && !codeState.error && (
          <p role="status" className="text-sm">
            {phone} numarasına 6 haneli kod gönderildi.
          </p>
        )}
        {codeState.error && (
          <p role="alert" className="text-sm text-destructive">
            {codeState.error}
          </p>
        )}
      </form>
      {codeState.sent && (
        <form onSubmit={submitWithoutReset(remove)} className="space-y-3">
          <Field label="SMS'teki kod" htmlFor="code" error={state.fields?.code}>
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="h-11 max-w-40" {...invalid("code", state.fields?.code)} />
          </Field>
          <Button type="submit" variant="destructive" className="h-11" disabled={removing} onClick={ask}>
            Hesabımı kalıcı olarak sil
          </Button>
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
