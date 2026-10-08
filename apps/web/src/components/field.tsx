import { startTransition, type FormEvent, type ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** Doğal <select> (klavye, ekran okuyucu ve mobilde yerel seçici hazır gelir); Input ile aynı görünüm. */
export const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive";

/** Etiket + alan + alan hatası. Hata, alanın aria-describedby'ı ile bağlanır (id: `${htmlFor}-error`). */
export function Field({ label, htmlFor, error, children, hint }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Formu sıfırlamadan gönder. <form action> işlem bitince formu sıfırlıyor: hata dönünce yazılan metin siliniyor,
 * kontrollü <select>/radyo DOM'da boşalıp state'le uyumsuz kalıyor (ilan formunda testte yakalandı).
 */
export const submitWithoutReset = (dispatch: (data: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  startTransition(() => dispatch(data));
};

/** Alanın erişilebilirlik öznitelikleri (hata varsa) */
export const invalid = (id: string, error?: string) =>
  error ? ({ "aria-invalid": true, "aria-describedby": `${id}-error` } as const) : ({} as const);
