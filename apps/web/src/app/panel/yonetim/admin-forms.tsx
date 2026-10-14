"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Field, invalid } from "@/components/field";
import { Button } from "@/components/ui/button";
import { resolveDisputeAction, resolveReportAction, reviewDocumentAction, reviewLoadAction, suspendUserAction, unsuspendUserAction, type AdminFormState } from "./actions";

const textareaClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** İki düğmeli formda hangi düğmeye basıldığı (name/value) FormData'ya girsin, form da sıfırlanmasın (yazılan not kalsın) */
const submitWithSubmitter = (dispatch: (data: FormData) => void, ask?: (submitter: HTMLButtonElement | null) => string | null) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  const question = ask?.(submitter);
  if (question && !window.confirm(question)) return;
  const data = new FormData(e.currentTarget, submitter);
  startTransition(() => dispatch(data));
};

function ErrorText({ state }: { state: AdminFormState }) {
  return state.error ? (
    <p role="alert" className="text-sm font-medium text-destructive">
      {state.error}
    </p>
  ) : null;
}

/** Y4: ilanı onayla (yayına çıkar) ya da reddet (iptal; geri alınamaz, onay sorulur) */
export function ReviewButtons({ id }: { id: string }) {
  const [state, dispatch, pending] = useActionState(reviewLoadAction, {});
  return (
    <form onSubmit={submitWithSubmitter(dispatch, (b) => (b?.value === "ret" ? "İlan reddedilsin mi? İlan iptal olur, geri alınamaz." : null))} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="onay" disabled={pending} className="h-11">
          Onayla
        </Button>
        <Button type="submit" name="decision" value="ret" variant="destructive" disabled={pending} className="h-11">
          Reddet
        </Button>
      </div>
      <ErrorText state={state} />
    </form>
  );
}

/** Y3: şikayet kararı. Yalnız "haklı" güven skoruna girer. */
export function ResolveForm({ id }: { id: string }) {
  const [state, dispatch, pending] = useActionState(resolveReportAction, {});
  const noteId = `note-${id}`;
  return (
    <form onSubmit={submitWithSubmitter(dispatch)} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Field label="Karar notu (isteğe bağlı)" htmlFor={noteId}>
        <textarea id={noteId} name="note" rows={2} maxLength={500} className={textareaClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="hakli" disabled={pending} className="h-11">
          Haklı
        </Button>
        <Button type="submit" name="decision" value="haksiz" variant="outline" disabled={pending} className="h-11">
          Haksız
        </Button>
      </div>
      <ErrorText state={state} />
    </form>
  );
}

/** İtiraz kararı: gerekçe zorunlu (iki tarafa bildirilir); geri alınamaz, onay sorulur */
export function DisputeForm({ id }: { id: string }) {
  const [state, dispatch, pending] = useActionState(resolveDisputeAction, {});
  const noteId = `dispute-note-${id}`;
  const ask = (b: HTMLButtonElement | null) =>
    b?.value === "iptal"
      ? "Teslim geçersiz sayılsın mı? Taşıma iptal olur ve nakliyecinin iptal oranına yazılır. Geri alınamaz."
      : "Teslim geçerli sayılsın mı? Taşıma tamamlanır. Geri alınamaz.";
  return (
    <form onSubmit={submitWithSubmitter(dispatch, ask)} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Field label="Karar gerekçesi (iki tarafa gönderilir)" htmlFor={noteId} error={state.error}>
        <textarea id={noteId} name="note" rows={2} maxLength={500} required className={textareaClass} {...invalid(noteId, state.error)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="outcome" value="tamamlandi" disabled={pending} className="h-11">
          Teslim geçerli: tamamla
        </Button>
        <Button type="submit" name="outcome" value="iptal" variant="destructive" disabled={pending} className="h-11">
          Teslim geçersiz: iptal et
        </Button>
      </div>
    </form>
  );
}

/** Y1: belge kararı. Onay: isteğe bağlı geçerlilik sonu (sigorta, SRC…). Ret: sebep zorunlu, onay sorulur. */
export function DocumentReviewForm({ id }: { id: string }) {
  const [state, dispatch, pending] = useActionState(reviewDocumentAction, {});
  const ask = (b: HTMLButtonElement | null) => (b?.value === "ret" ? "Belge reddedilsin mi? Sebep sahibine gönderilir." : null);
  return (
    <form onSubmit={submitWithSubmitter(dispatch, ask)} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Geçerlilik sonu (isteğe bağlı)" htmlFor={`exp-${id}`} hint="Süreli belgede (sigorta, SRC) bitiş günü">
          <input id={`exp-${id}`} name="expiresAt" type="date" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Ret sebebi (retde zorunlu)" htmlFor={`rej-${id}`}>
          <textarea id={`rej-${id}`} name="rejectReason" rows={2} maxLength={500} className={textareaClass} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="onay" disabled={pending} className="h-11">
          Onayla
        </Button>
        <Button type="submit" name="decision" value="ret" variant="destructive" disabled={pending} className="h-11">
          Reddet
        </Button>
      </div>
      <ErrorText state={state} />
    </form>
  );
}

/** Y2: askıya al — önce sebep alanı açılır; onay sorulur (ilanları iptal olur, giriş kapanır) */
export function SuspendForm({ id, who }: { id: string; who: string }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(suspendUserAction, {});
  const reasonId = `reason-${id}`;
  if (!open) {
    return (
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Askıya al
      </Button>
    );
  }
  return (
    <form
      onSubmit={submitWithSubmitter(dispatch, () => `${who} askıya alınsın mı? Giriş yapamaz; yayındaki ilanları ve boş araç ilanları iptal olur.`)}
      className="w-full max-w-md space-y-2 rounded-lg border p-3"
    >
      <input type="hidden" name="id" value={id} />
      <Field label="Askıya alma sebebi" htmlFor={reasonId} error={state.error}>
        <textarea id={reasonId} name="reason" rows={2} maxLength={500} required className={textareaClass} {...invalid(reasonId, state.error)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pending} className="h-11">
          Askıya al
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

export function UnsuspendButton({ id, who }: { id: string; who: string }) {
  const [state, dispatch, pending] = useActionState(unsuspendUserAction, {});
  return (
    <form onSubmit={submitWithSubmitter(dispatch, () => `${who} için askı kaldırılsın mı? Kapanan ilanlar geri açılmaz.`)} className="space-y-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Askıyı kaldır
      </Button>
      <ErrorText state={state} />
    </form>
  );
}
