"use client";

import { useActionState } from "react";
import { CircleCheck, CircleX, PackageCheck } from "lucide-react";
import type { ConfirmationAnswer } from "@nakliye/shared";
import { Button } from "@/components/ui/button";
import { answerAction, type AnswerState } from "./actions";

const DONE: Record<ConfirmationAnswer, string> = {
  gecerli: "Teşekkürler, ilanınız teyit edildi. Nakliyeciler ilanınızı \"az önce teyit edildi\" olarak görüyor.",
  arac_bulundu: "İlanınız kapatıldı. Hayırlı olsun!",
  iptal: "İlanınız iptal edildi.",
};

export function AnswerButtons({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AnswerState, FormData>(answerAction.bind(null, token), {});

  if (state.answered) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 p-4 font-medium text-emerald-900">
        {DONE[state.answered]}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <Button type="submit" name="answer" value="gecerli" disabled={pending} className="h-14 w-full text-base">
        <CircleCheck aria-hidden /> Evet, hâlâ geçerli
      </Button>
      <Button type="submit" name="answer" value="arac_bulundu" variant="outline" disabled={pending} className="h-14 w-full text-base">
        <PackageCheck aria-hidden /> Araç buldum, ilanı kapat
      </Button>
      <Button type="submit" name="answer" value="iptal" variant="outline" disabled={pending} className="h-14 w-full text-base">
        <CircleX aria-hidden /> Vazgeçtim, iptal et
      </Button>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
