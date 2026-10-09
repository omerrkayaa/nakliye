"use client";

import { useActionState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleFavoriteAction, type FavoriteState } from "./actions";

/** Favori aç/kapat (yıldız). aria-pressed: ekran okuyucu durumu duyar. */
export function FavoriteButton({ id, favorite, name }: { id: string; favorite: boolean; name: string }) {
  const [state, action, pending] = useActionState<FavoriteState, FormData>(toggleFavoriteAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="favorite" value={favorite ? "0" : "1"} />
      <Button type="submit" variant={favorite ? "default" : "outline"} disabled={pending} aria-pressed={favorite} aria-label={`${name}: favori`} className="h-11">
        <Star className={favorite ? "fill-current" : ""} aria-hidden /> {favorite ? "Favori" : "Favorilere ekle"}
      </Button>
      {state.error && (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      )}
    </form>
  );
}
