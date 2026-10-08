import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "./api";

/**
 * Ekran odaklandıkça GET isteğini (yeniden) çalıştırır: başka ekranda teklif verip dönünce liste tazelenir.
 * path null ise istek yapılmaz.
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await api<T>(path);
      if (mine === seq.current) setData(d);
    } catch (e) {
      if (mine === seq.current) setError(e instanceof ApiError ? e.message : "Bir sorun oluştu; tekrar deneyin.");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { data, error, loading, reload: load, setData };
}
