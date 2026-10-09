"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { bulkConfirmAction, type BulkConfirmState } from "./actions";

/**
 * P4 toplu teyit (F1): satırlardaki kutular bu forma `form` özniteliğiyle bağlı (tablo sunucuda kalır).
 * "Tümünü teyit et" bu sayfadaki yayındaki ilanların hepsini gönderir.
 */
export function BulkConfirm({ formId, visibleIds }: { formId: string; visibleIds: string[] }) {
  const [state, action, pending] = useActionState<BulkConfirmState, FormData>(bulkConfirmAction, {});
  return (
    <form id={formId} action={action} className="flex flex-wrap items-center gap-3">
      {visibleIds.map((id) => (
        <input key={id} type="hidden" name="all" value={id} />
      ))}
      <Button type="submit" name="mode" value="selected" variant="outline" disabled={pending} className="h-11">
        Seçilenleri teyit et
      </Button>
      <Button type="submit" name="mode" value="all" variant="outline" disabled={pending} className="h-11">
        Tümünü teyit et ({visibleIds.length})
      </Button>
      {pending && <span className="text-sm text-muted-foreground">Kaydediliyor…</span>}
      {!pending && state.confirmed !== undefined && (
        <span role="status" className="text-sm font-medium">
          {state.confirmed === 0 && !state.errors?.length ? "Teyit edilecek ilan seçmediniz." : `${state.confirmed} ilan teyit edildi.`}
        </span>
      )}
      {!pending && state.errors && state.errors.length > 0 && (
        <span role="alert" className="text-sm text-destructive">
          {state.errors.length} ilan teyit edilemedi: {state.errors[0]}
        </span>
      )}
    </form>
  );
}
