"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewBulkAction, publishBulkAction, type PreviewState, type PublishState } from "./actions";

/** F5: dosya seç → önizle (satır satır hata) → hazır satırları yayınla → sonuç. */
export function BulkUpload() {
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewBulkAction, {});
  const [publish, publishAction, publishing] = useActionState<PublishState, FormData>(publishBulkAction, {});
  const rows = preview.rows ?? [];
  const ready = rows.filter((r) => r.input);
  const resultByRow = new Map((publish.results ?? []).map((r) => [r.row, r]));
  const published = publish.results !== undefined;

  return (
    <div className="space-y-6">
      {!published && (
        <form action={previewAction} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <label htmlFor="file" className="text-sm font-medium">
              Excel dosyası (.xlsx)
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              className="block text-sm file:mr-3 file:h-10 file:rounded-md file:border file:bg-background file:px-3"
            />
          </div>
          <Button type="submit" variant="outline" disabled={previewing} className="h-11">
            {previewing ? "Okunuyor…" : "Önizle"}
          </Button>
        </form>
      )}

      {preview.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 font-medium text-destructive">
          {preview.error}
        </p>
      )}

      {rows.length > 0 && (
        <section aria-label="Önizleme" className="space-y-3">
          <p className="font-medium">
            {preview.fileName}: {ready.length} satır hazır
            {rows.length > ready.length && <span className="text-destructive">, {rows.length - ready.length} satırda hata var (yayınlanmaz)</span>}
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Satır</TableHead>
                  <TableHead>Güzergâh</TableHead>
                  <TableHead>Yükleme</TableHead>
                  <TableHead>Yük</TableHead>
                  <TableHead>Fiyat</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const res = resultByRow.get(r.row);
                  return (
                    <TableRow key={r.row} data-row={r.row}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell className="font-medium">{r.summary.route}</TableCell>
                      <TableCell>{r.summary.days}</TableCell>
                      <TableCell>{r.summary.load}</TableCell>
                      <TableCell>{r.summary.price}</TableCell>
                      <TableCell className="whitespace-normal">
                        {res?.id ? (
                          <Link href={`/panel/ilanlar/${res.id}`} className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 underline-offset-4 hover:underline">
                            <CircleCheck className="size-4" aria-hidden /> {res.status === "moderasyonda" ? "Onay bekliyor" : "Yayında"}
                          </Link>
                        ) : res?.error ? (
                          <span className="inline-flex items-start gap-1 text-destructive">
                            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {res.error}
                          </span>
                        ) : r.errors.length ? (
                          <ul className="space-y-0.5 text-destructive">
                            {r.errors.map((e) => (
                              <li key={e} className="flex items-start gap-1">
                                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {e}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CircleCheck className="size-4" aria-hidden /> Hazır
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {published ? (
            <div role="status" className="space-y-3 rounded-lg border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-emerald-950 dark:text-emerald-100">
              <p className="font-semibold">
                {publish.created} ilan açıldı{(publish.results?.length ?? 0) > (publish.created ?? 0) ? `, ${(publish.results?.length ?? 0) - (publish.created ?? 0)} satır açılamadı` : ""}.
              </p>
              <p className="text-sm">Yeni hesapların ilk ilanları kısa bir kontrolden sonra yayına çıkar.</p>
              <Link href="/panel/ilanlar" className={buttonVariants({ className: "h-11" })}>
                İlanlarıma git
              </Link>
            </div>
          ) : (
            ready.length > 0 && (
              <form action={publishAction}>
                <input type="hidden" name="rows" value={JSON.stringify(ready.map((r) => ({ row: r.row, input: r.input })))} />
                <Button type="submit" disabled={publishing} className="h-11">
                  {publishing ? "Yayınlanıyor…" : `${ready.length} ilanı yayınla`}
                </Button>
              </form>
            )
          )}
          {publish.error && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 font-medium text-destructive">
              {publish.error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
