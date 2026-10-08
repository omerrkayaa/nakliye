import { cacheLife } from "next/cache";
import { API_URL } from "./session";
import type { Province } from "./types";

/**
 * 81 il / 973 ilçe (kimlikler kalıcı, nadiren değişir): sunucuda günlük önbellek.
 * Yalnız oturum okuyan (dinamik) bileşenlerin içinden çağrılır; böylece derleme sırasında önceden çizilmez
 * ve `next build` API'nin açık olmasına bağlı kalmaz.
 */
export async function getLocations(): Promise<Province[]> {
  "use cache";
  cacheLife("days");
  const res = await fetch(`${API_URL}/locations`);
  if (!res.ok) throw new Error(`İl/ilçe listesi alınamadı (${res.status})`);
  return (await res.json()) as Province[];
}
