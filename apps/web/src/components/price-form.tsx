import { Calculator } from "lucide-react";
import { Field, selectClass } from "@/components/field";
import { buttonVariants } from "@/components/ui/button";
import { TR_PROVINCES } from "@/lib/provinces";

const SORTED = [...TR_PROVINCES].sort((a, b) => a[1].localeCompare(b[1], "tr"));

/** Fiyat hesaplayıcı formu: betiksiz GET → /fiyat?nereden=&nereye= (paylaşılabilir adres). */
export function PriceForm({ from, to, id = "fiyat" }: { from?: number; to?: number; id?: string }) {
  return (
    <form action="/fiyat" method="get" aria-label="Taşıma ücreti hesapla" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Select id={`${id}-nereden`} name="nereden" label="Nereden" value={from} />
      <Select id={`${id}-nereye`} name="nereye" label="Nereye" value={to} />
      <button type="submit" className={buttonVariants({ size: "lg", className: "h-11 px-6 text-base" })}>
        <Calculator aria-hidden /> Hesapla
      </button>
    </form>
  );
}

function Select({ id, name, label, value }: { id: string; name: string; label: string; value?: number }) {
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} name={name} required defaultValue={value ?? ""} className={selectClass}>
        <option value="" disabled>
          İl seçin
        </option>
        {SORTED.map(([pid, n]) => (
          <option key={pid} value={pid}>
            {n}
          </option>
        ))}
      </select>
    </Field>
  );
}
