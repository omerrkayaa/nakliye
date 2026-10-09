import type { Metadata } from "next";
import { Suspense } from "react";
import { api } from "@/lib/api";
import type { AdminMetrics } from "@/lib/types";

export const metadata: Metadata = { title: "Metrikler" };

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const short = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
};
const pct = (r: number | null) => (r === null ? "—" : `%${Math.round(r * 100)}`);

/** Y5 / FR-53: tez metrikleri. Ana başarı ölçütü haftalık kapanan yük (tamamlanan iş). */
export default function MetricsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
      <Metrics />
    </Suspense>
  );
}

async function Metrics() {
  const m = await api<AdminMetrics>("/admin/metrics");
  const thisWeek = m.weeklyClosed.at(-1)!;
  return (
    <div className="space-y-8">
      <section aria-labelledby="hero" className="space-y-1">
        <h2 id="hero" className="text-sm font-medium text-muted-foreground">
          Bu hafta kapanan yük
        </h2>
        <p className="text-5xl font-semibold" data-testid="closed-this-week">
          {thisWeek.closed}
        </p>
        <p className="text-sm text-muted-foreground">{short(thisWeek.week)} haftası · tamamlanan taşıma (tezin ana başarı ölçütü)</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Yayındaki ilan" value={String(m.live.visible)} note={`${pct(m.live.freshness)} son 24 saatte teyitli`} />
        <Tile
          label="Teyit cevap oranı"
          value={pct(m.confirmations.answerRate)}
          note={`${m.confirmations.answered} cevap, ${m.confirmations.unanswered} cevapsız${m.confirmations.medianMinutes !== null ? ` · medyan ${m.confirmations.medianMinutes} dk` : ""} · son ${m.confirmations.windowDays} gün`}
        />
        <Tile
          label="Eşleşme isabeti"
          value={pct(m.matches.hitRate)}
          note={`${m.matches.converted} / ${m.matches.notified} bildirim teklife ya da aramaya döndü · son ${m.matches.windowDays} gün`}
        />
      </div>

      <Columns
        title="Haftalık kapanan yük"
        subtitle="Son 8 hafta, pazartesi başlangıçlı"
        unit="taşıma"
        points={m.weeklyClosed.map((w) => ({ key: w.week, label: short(w.week), value: w.closed }))}
      />
      <Columns
        title="Günlük yeni ilan"
        subtitle="Son 14 gün"
        unit="ilan"
        points={m.dailyLoads.map((d) => ({ key: d.day, label: short(d.day), value: d.loads }))}
      />
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="space-y-1 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/**
 * Tek serili sütun grafiği (dataviz: tek renk, ≤24px sütun, üstü 4px yuvarlak, tek taban çizgisi, seçici etiket:
 * yalnız son nokta ve en yüksek). Her sütun üzerine gelince/odaklanınca değerini gösterir; aynı veri tabloda da var.
 */
function Columns({ title, subtitle, unit, points }: { title: string; subtitle: string; unit: string; points: { key: string; label: string; value: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const peak = points.reduce((a, p) => (p.value > a.value ? p : a), points[0]!);
  const H = 160;
  return (
    <section className="space-y-3" aria-label={title}>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-w-max items-end gap-1 border-b border-border pt-6" style={{ height: H + 24 }} role="list">
          {points.map((p, i) => {
            const last = i === points.length - 1;
            const labelled = last || (p === peak && p.value > 0);
            return (
              <div
                key={p.key}
                role="listitem"
                tabIndex={0}
                aria-label={`${p.label}: ${p.value} ${unit}`}
                className="group relative flex h-full w-10 flex-col items-center justify-end outline-none"
              >
                {labelled && <span className="mb-1 text-xs font-medium tabular-nums">{p.value}</span>}
                <div
                  className="w-6 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80 group-focus:opacity-80"
                  style={{ height: p.value === 0 ? 1 : Math.max(2, Math.round((p.value / max) * H)) }}
                />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-sm group-hover:block group-focus:block"
                >
                  <strong className="font-semibold">{p.value}</strong> <span className="text-muted-foreground">{unit} · {p.label}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex min-w-max gap-1 pt-1">
          {points.map((p, i) => (
            <span key={p.key} className="w-10 text-center text-[11px] text-muted-foreground">
              {(points.length - 1 - i) % 2 === 0 ? p.label : ""}
            </span>
          ))}
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Tablo olarak göster</summary>
        <table className="mt-2 w-full max-w-sm">
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-b last:border-0">
                <td className="py-1">{p.label}</td>
                <td className="py-1 text-right tabular-nums">
                  {p.value} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
