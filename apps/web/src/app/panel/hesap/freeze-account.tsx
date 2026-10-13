"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { freezeAccountAction, type FreezeState } from "./actions";

/** FR-08: tek adım (kod yok, geri alınabilir); onay penceresinden sonra dondurulur ve giriş sayfasına dönülür. */
export function FreezeAccount() {
  const [state, freeze, freezing] = useActionState<FreezeState, FormData>(freezeAccountAction, {});
  const ask = (e: React.MouseEvent) => {
    if (!window.confirm("Hesabınız dondurulsun mu? İlanlarınız kapanır, bildirim almazsınız. Yeniden giriş yaptığınızda hesabınız açılır.")) e.preventDefault();
  };
  return (
    <form action={freeze} className="space-y-2">
      <Button type="submit" variant="outline" className="h-11" disabled={freezing} onClick={ask}>
        Hesabımı dondur
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
