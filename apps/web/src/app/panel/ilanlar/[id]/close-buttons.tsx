"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { closeLoadAction, type FormState } from "../actions";

/** İlanı kapat (FR-15). Geri alınamadığı için onay sorulur. Moderasyondaki ilan yalnız iptal edilebilir. */
export function CloseButtons({ id, canFind }: { id: string; canFind: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(closeLoadAction, {});
  const ask = (message: string) => (e: React.MouseEvent) => {
    if (!window.confirm(message)) e.preventDefault();
  };
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-2">
        {canFind && (
          <Button type="submit" name="reason" value="arac_bulundu" variant="outline" disabled={pending} onClick={ask("İlan 'araç bulundu' olarak kapatılsın mı? Bekleyen teklifler sonuçlanır.")}>
            Araç buldum, kapat
          </Button>
        )}
        <Button type="submit" name="reason" value="iptal" variant="destructive" disabled={pending} onClick={ask("İlan iptal edilsin mi? Bu işlem geri alınamaz.")}>
          İlanı iptal et
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
