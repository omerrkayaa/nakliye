"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { RATING_TAGS, RATING_TAGS_FOR } from "@nakliye/shared";
import { submitWithoutReset } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { rateJobAction, type JobFormState } from "../actions";

/** Nakliyeciyi puanla (FR-40): 1–5 yıldız, yalnız nakliyeciye uygun etiketler, isteğe bağlı yorum. */
export function RatingForm({ id }: { id: string }) {
  const [state, dispatch, pending] = useActionState<JobFormState, FormData>(rateJobAction, {});
  const [stars, setStars] = useState(0);
  return (
    <form onSubmit={submitWithoutReset(dispatch)} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Puanınız</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer rounded-md p-1 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
              <input type="radio" name="stars" value={n} className="sr-only" aria-label={`${n} yıldız`} onChange={() => setStars(n)} checked={stars === n} />
              <Star className={`size-9 ${n <= stars ? "fill-brand-accent text-brand-accent" : "text-muted-foreground"}`} aria-hidden />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Öne çıkanlar (isteğe bağlı)</legend>
        <div className="flex flex-wrap gap-2">
          {RATING_TAGS_FOR.carrier.map((t) => (
            <label key={t} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 has-checked:border-primary has-checked:bg-primary/5">
              <input type="checkbox" name="tags" value={t} className="size-4 accent-primary" />
              {RATING_TAGS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="rating-comment">Yorum (isteğe bağlı)</Label>
        <textarea
          id="rating-comment"
          name="comment"
          rows={3}
          maxLength={500}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">Profilde adınız gösterilmeden görünür.</p>
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11">
        Puanı gönder
      </Button>
    </form>
  );
}
