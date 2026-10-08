import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Önceki/Sonraki; query: sayfa dışındaki parametreler ("durum=kapali&" gibi, & ile biten) */
export function Pager({ base, page, hasMore, query = "" }: { base: string; page: number; hasMore: boolean; query?: string }) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="flex justify-between" aria-label="Sayfalar">
      {page > 1 ? (
        <Link className={buttonVariants({ variant: "outline" })} href={`${base}?${query}sayfa=${page - 1}`}>
          Önceki
        </Link>
      ) : (
        <span />
      )}
      {hasMore && (
        <Link className={buttonVariants({ variant: "outline" })} href={`${base}?${query}sayfa=${page + 1}`}>
          Sonraki
        </Link>
      )}
    </nav>
  );
}
