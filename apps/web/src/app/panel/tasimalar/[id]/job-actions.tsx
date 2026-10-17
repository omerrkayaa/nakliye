"use client";

import { useActionState, useState } from "react";
import type { JobStatus } from "@nakliye/shared";
import { Field, invalid, submitWithoutReset } from "@/components/field";
import { Button } from "@/components/ui/button";
import { cancelJobAction, completeJobAction, disputeJobAction, newCodeAction, type JobFormState } from "../actions";

type Action = (prev: JobFormState, form: FormData) => Promise<JobFormState>;

function ErrorText({ state }: { state: JobFormState }) {
  return state.error ? (
    <p role="alert" className="text-sm font-medium text-destructive">
      {state.error}
    </p>
  ) : null;
}

/** Onay sorulan tek düğmeli işlem (ör. elle tamamla). */
function ConfirmAction({ id, action, label, question, variant = "default" }: { id: string; action: Action; label: string; question: string; variant?: "default" | "outline" }) {
  const [state, dispatch, pending] = useActionState(action, {});
  return (
    <form action={dispatch} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant={variant} disabled={pending} className="h-11" onClick={(e) => !window.confirm(question) && e.preventDefault()}>
        {label}
      </Button>
      <ErrorText state={state} />
    </form>
  );
}

/** Sebep isteyen işlem (iptal, itiraz): önce sebep alanı açılır. */
function ReasonAction({ id, action, label, confirmLabel, fieldLabel, destructive }: { id: string; action: Action; label: string; confirmLabel: string; fieldLabel: string; destructive?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(action, {});
  const fieldId = `${id}-${label}-reason`.replace(/\s/g, "-");
  if (!open) {
    return (
      <Button type="button" variant={destructive ? "destructive" : "outline"} className="h-11" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form onSubmit={submitWithoutReset(dispatch)} className="w-full max-w-lg space-y-3 rounded-lg border p-4">
      <input type="hidden" name="id" value={id} />
      <Field label={fieldLabel} htmlFor={fieldId} error={state.error}>
        <textarea
          id={fieldId}
          name="reason"
          rows={3}
          maxLength={500}
          required
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          {...invalid(fieldId, state.error)}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending} className="h-11">
          {confirmLabel}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

/** Kod kaybolduysa ya da deneme hakkı bittiyse: yeni kod (eskisi geçersizleşir). */
function NewCode({ id }: { id: string }) {
  const [state, dispatch, pending] = useActionState(newCodeAction, {});
  return (
    <form action={dispatch} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {state.deliveryCode ? (
        <p role="status" className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-3 text-emerald-950 dark:text-emerald-100">
          Yeni teslim kodunuz: <span className="font-mono text-xl font-bold tracking-[0.3em]">{state.deliveryCode}</span>
          <span className="block text-sm">Eski kod artık geçersiz. Kod SMS ile de gönderildi.</span>
        </p>
      ) : (
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          className="h-11"
          onClick={(e) => !window.confirm("Yeni teslim kodu oluşturulsun mu? Eski kod geçersiz olur.") && e.preventDefault()}
        >
          Yeni teslim kodu
        </Button>
      )}
      <ErrorText state={state} />
    </form>
  );
}

/** Yük sahibinin taşıma işlemleri (FR-33, FR-34, BR-31, BR-32); hangisinin görüneceği duruma bağlı. */
export function JobActions({ id, status }: { id: string; status: JobStatus }) {
  if (status === "anlasildi" || status === "yuklendi" || status === "yolda") {
    return (
      <div className="flex flex-wrap items-start gap-3">
        <ConfirmAction
          id={id}
          action={completeJobAction}
          label="Teslimi elle onayla"
          question="Yükün teslim alındığını onaylıyor musunuz? Taşıma tamamlanır (kod girilmeden)."
        />
        <NewCode id={id} />
        <ReasonAction id={id} action={cancelJobAction} label="Taşımayı iptal et" confirmLabel="İptal et" fieldLabel="İptal sebebi" destructive />
      </div>
    );
  }
  if (status === "teslim_edildi") {
    return (
      <div className="flex flex-wrap items-start gap-3">
        <ConfirmAction id={id} action={completeJobAction} label="Sorun yok, tamamla" question="Taşıma tamamlansın mı? Sonra itiraz edilemez." />
        <ReasonAction id={id} action={disputeJobAction} label="İtiraz et" confirmLabel="İtirazı gönder" fieldLabel="Sorun nedir? (ör. eksik ya da hasarlı yük)" />
      </div>
    );
  }
  return null;
}
