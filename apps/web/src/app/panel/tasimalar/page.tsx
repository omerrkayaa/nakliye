import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CARGO_TYPES } from "@nakliye/shared";
import { JobStatusBadge } from "@/components/job-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { dayRange, place, tl } from "@/lib/format";
import type { Job, Page } from "@/lib/types";
import { cn } from "cn";

export const metadata: Metadata = { title: "Taşımalar" };

/** P6 Taşımalar: süren ve geçmiş işler. */
export default function JobsPage({ searchParams }: PageProps<"/panel/tasimalar">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Taşımalar</h1>
        <p className="text-muted-foreground">Kabul ettiğiniz teklifler taşımaya dönüşür. Teslimi kodla ya da elle onaylayın, sonra nakliyeciyi puanlayın.</p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Yükleniyor…</p>}>
        <Jobs searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Jobs({ searchParams }: Pick<PageProps<"/panel/tasimalar">, "searchParams">) {
  const { kapsam, sayfa } = await searchParams;
  const past = kapsam === "gecmis";
  const page = Math.max(1, Number(typeof sayfa === "string" ? sayfa : 1) || 1);
  const data = await api<Page<Job>>(`/jobs?scope=${past ? "past" : "active"}&page=${page}`);
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("border-b-2 px-1 pb-2 text-sm font-medium", active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <nav className="flex gap-6 border-b" aria-label="Taşıma listesi">
        {tab("/panel/tasimalar", "Sürenler", !past)}
        {tab("/panel/tasimalar?kapsam=gecmis", "Geçmiş", past)}
      </nav>
      {data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {past ? "Geçmiş taşıma yok." : "Süren taşıma yok. Bir teklifi kabul edince burada görünür."}
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Güzergâh</TableHead>
                <TableHead>Yükleme</TableHead>
                <TableHead>Yük</TableHead>
                <TableHead>Nakliyeci</TableHead>
                <TableHead>Ücret</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((j) => (
                <TableRow key={j.id} data-job-id={j.id}>
                  <TableCell className="font-medium">
                    <Link href={`/panel/tasimalar/${j.id}`} className="underline-offset-4 hover:underline">
                      {place(j.load.origin)} → {place(j.load.dest)}
                    </Link>
                  </TableCell>
                  <TableCell>{dayRange(j.load.loadFrom, j.load.loadTo)}</TableCell>
                  <TableCell>
                    {CARGO_TYPES[j.load.cargoType]}, {j.load.weightTon} ton
                  </TableCell>
                  <TableCell>{j.counterpart.displayName ?? "—"}</TableCell>
                  <TableCell>{j.agreedPrice !== null ? tl(j.agreedPrice) : "—"}</TableCell>
                  <TableCell>
                    <JobStatusBadge status={j.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {(page > 1 || data.hasMore) && (
        <nav className="flex justify-between text-sm" aria-label="Sayfalar">
          {page > 1 ? <Link href={`/panel/tasimalar?${past ? "kapsam=gecmis&" : ""}sayfa=${page - 1}`}>← Önceki</Link> : <span />}
          {data.hasMore && <Link href={`/panel/tasimalar?${past ? "kapsam=gecmis&" : ""}sayfa=${page + 1}`}>Sonraki →</Link>}
        </nav>
      )}
    </div>
  );
}
