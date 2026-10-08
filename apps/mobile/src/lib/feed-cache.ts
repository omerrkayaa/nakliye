import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Load } from "./types";

// Çevrimdışı uyarısı için yük akışının son başarılı ilk sayfası (filtresiz). Telefonda internet sık kopar (yol, garaj).
const KEY = "nk_feed";

export interface CachedFeed {
  at: string;
  items: Load[];
}

export async function saveFeed(items: Load[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify({ at: new Date().toISOString(), items } satisfies CachedFeed)).catch(() => {});
}

export async function readFeed(): Promise<CachedFeed | null> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedFeed;
  } catch {
    return null;
  }
}
