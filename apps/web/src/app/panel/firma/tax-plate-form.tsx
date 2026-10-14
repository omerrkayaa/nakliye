"use client";

import { DOCUMENT_LIMITS } from "@nakliye/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";

const MB = DOCUMENT_LIMITS.maxBytes / 1024 / 1024;

/**
 * Vergi levhası yükleme. Büyük dosya gönderilmeden yakalanır (proxy sınırına takılıp yarım gitmesin). Dosya sunucu
 * eylemiyle değil ./levha rota işleyicisiyle gider (eylemlerin gövde sınırı varsayılan 1 MB'ta kalsın).
 */
export function TaxPlateForm({ replacing }: { replacing: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<{ error?: string; done?: boolean }>({});
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (file instanceof File && file.size > DOCUMENT_LIMITS.maxBytes) return setState({ error: `Dosya en çok ${MB} MB olabilir` });
    setPending(true);
    setState({});
    try {
      const res = await fetch("/panel/firma/levha", { method: "POST", body: data });
      // Oturum düştüyse API çağrısı girişe yönlendirir; fetch yönlendirmeyi izler
      if (res.redirected) return window.location.assign(res.url);
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) return setState({ error: json?.error ?? "Yüklenemedi; tekrar deneyin." });
      form.reset();
      setState({ done: true });
      router.refresh();
    } catch {
      setState({ error: "Sunucuya ulaşılamadı; tekrar deneyin." });
    } finally {
      setPending(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <Field label={`${replacing ? "İncelemedekinin yerine yeni dosya" : "Vergi levhası"} (PDF, JPEG ya da PNG; en çok ${MB} MB)`} htmlFor="tax-plate">
        <input
          id="tax-plate"
          name="file"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png"
          className="block w-full text-sm file:mr-3 file:h-11 file:rounded-lg file:border file:border-input file:bg-background file:px-4 file:font-medium"
        />
      </Field>
      <Button type="submit" disabled={pending} className="h-11">
        {pending ? "Yükleniyor…" : "Vergi levhasını yükle"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}
      {state.done && !pending && (
        <p role="status" className="text-sm">
          Yüklendi; yönetici incelemesinden sonra firmanız doğrulanır.
        </p>
      )}
    </form>
  );
}
