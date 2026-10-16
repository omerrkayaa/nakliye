import AsyncStorage from "@react-native-async-storage/async-storage";
import type { VehicleType } from "@nakliye/shared";
import type { Load } from "./types";

// Çevrimdışı uyarısı için yük akışının son başarılı ilk sayfası ve hangi süzgeçle alındığı. Telefonda internet sık kopar (yol, garaj).
const KEY = "nk_feed";
// Son seçilen Nereden/Nereye (il): uygulama yeniden açılınca rota tekrar seçilmesin (NFR-07 "aramadan aramaya")
const ROUTE_KEY = "nk_feed_route";

export interface FeedFilter {
  from: number | null;
  to: number | null;
  vehicle: VehicleType | null;
}

export interface CachedFeed {
  at: string;
  filter: FeedFilter;
  items: Load[];
}

export async function saveFeed(filter: FeedFilter, items: Load[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify({ at: new Date().toISOString(), filter, items } satisfies CachedFeed)).catch(() => {});
}

/** Kayıtlı liste yalnız aynı süzgeçle alındıysa döner (başka süzgecin listesi bu süzgece uymaz). Eski kayıtlar filtresiz. */
export async function readFeed(filter: FeedFilter): Promise<CachedFeed | null> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as CachedFeed;
    const f = c.filter ?? { from: null, to: null, vehicle: null };
    return f.from === filter.from && f.to === filter.to && f.vehicle === filter.vehicle ? c : null;
  } catch {
    return null;
  }
}

export interface FeedRoute {
  from: number | null;
  to: number | null;
}

// İl kimliği = plaka (1–81); bozuk ya da eski kayıt yok sayılır
const provinceId = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 81 ? v : null);

export async function saveRoute(route: FeedRoute) {
  await AsyncStorage.setItem(ROUTE_KEY, JSON.stringify(route)).catch(() => {});
}

export async function readRoute(): Promise<FeedRoute> {
  const raw = await AsyncStorage.getItem(ROUTE_KEY).catch(() => null);
  try {
    const r = raw ? (JSON.parse(raw) as Partial<Record<keyof FeedRoute, unknown>>) : null;
    return { from: provinceId(r?.from), to: provinceId(r?.to) };
  } catch {
    return { from: null, to: null };
  }
}
