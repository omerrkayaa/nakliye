"use server";

import { CONFIRMATION_ANSWERS, type ConfirmationAnswer } from "@nakliye/shared";
import { api, ApiError } from "@/lib/api";

export interface AnswerState {
  answered?: ConfirmationAnswer;
  error?: string;
}

/** SMS linkinden teyit cevabı (giriş yok; token tek kullanımlık, cevaptan sonra geçersizleşir). */
export async function answerAction(token: string, _prev: AnswerState, form: FormData): Promise<AnswerState> {
  const answer = form.get("answer") as ConfirmationAnswer;
  if (!CONFIRMATION_ANSWERS.includes(answer)) return { error: "Geçersiz seçim" };
  try {
    await api(`/public/confirm/${encodeURIComponent(token)}`, { method: "POST", body: { answer }, auth: false });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
  return { answered: answer };
}
