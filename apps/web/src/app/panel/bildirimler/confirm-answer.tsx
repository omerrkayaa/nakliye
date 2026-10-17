"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { answerConfirmAction, type NotifyState } from "./actions";

/** Teyit sorusu bildiriminde iki düğme; "araç bulundu" ilanı kapattığı için onay sorulur */
export function ConfirmAnswer({ id, loadId }: { id: string; loadId: string }) {
  const [state, dispatch, pending] = useActionState<NotifyState, FormData>(answerConfirmAction, {});
  if (state.done) {
    return (
      <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
        ✓ {state.done}
      </p>
    );
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.value === "arac_bulundu" && !window.confirm("Araç bulundu mu? İlan yayından kalkar ve bekleyen teklifler kapanır.")) return;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(data));
  };
  return (
    <form onSubmit={submit} className="space-y-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="loadId" value={loadId} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="answer" value="gecerli" size="sm" disabled={pending}>
          Evet, geçerli
        </Button>
        <Button type="submit" name="answer" value="arac_bulundu" size="sm" variant="outline" disabled={pending}>
          Araç bulundu
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
