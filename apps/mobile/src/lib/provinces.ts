import { useEffect, useState } from "react";
import { api } from "./api";
import type { Province } from "./types";

// İl/ilçe listesi neredeyse hiç değişmez: uygulama açıkken bir kez çekilir.
let cache: Promise<Province[]> | null = null;

/** İller (alfabetik), her biri ilçeleriyle */
export function useProvinces() {
  const [list, setList] = useState<Province[]>([]);
  useEffect(() => {
    cache ??= api<Province[]>("/locations", { auth: false })
      .then((ps) => [...ps].sort((a, b) => a.name.localeCompare(b.name, "tr")))
      .catch((e) => {
        cache = null;
        throw e;
      });
    cache.then(setList).catch(() => {});
  }, []);
  return list;
}
