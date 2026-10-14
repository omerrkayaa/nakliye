import Constants from "expo-constants";
import type { Tokens } from "./types";

/**
 * API adresi: EXPO_PUBLIC_API_URL verilmişse o; yoksa Expo geliştirme sunucusunun çalıştığı bilgisayarın adresi, port 3000.
 * Expo Go'da telefon bilgisayara Wi-Fi üzerinden bağlandığı için "localhost" telefonun kendisi olurdu.
 */
export const devHost = Constants.expoConfig?.hostUri?.split(":")[0];
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${devHost ?? "localhost"}:3000/api/v1`;

/** API'nin döndürdüğü hata (mesaj kullanıcıya gösterilebilir Türkçe metindir). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Oturum: erişim belirteci yalnız bellekte; yenileme belirteci AuthProvider'ın güvenli deposunda.
let tokens: Tokens | null = null;
/** notice: oturum neden kapandı (giriş ekranında gösterilir), ör. hesap askıya alındı */
let onTokens: (t: Tokens | null, notice?: string) => void = () => {};
/** API AuthGuard askıdaki hesabın her isteğini bu mesajla 403'ler (FR-51) */
const SUSPENDED = "Hesabınız askıya alındı.";
let refreshing: Promise<boolean> | null = null;

/** AuthProvider bağlar: belirteç yenilenince ya da oturum düşünce haber verilir. */
export function bindSession(initial: Tokens | null, listener: (t: Tokens | null, notice?: string) => void) {
  tokens = initial;
  onTokens = listener;
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** JSON'a çevrilir; FormData olduğu gibi (çok parçalı, belge yükleme) gider */
  body?: unknown;
  /** false: oturumsuz uç nokta (OTP) */
  auth?: boolean;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  let res = await send(path, opts);
  // Erişim belirteci 15 dk'da düşer: bir kez yenileyip tekrar dene
  if (res.status === 401 && opts.auth !== false && (await refresh())) res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = messageOf(json, res.status);
    if (opts.auth !== false && (res.status === 401 || (res.status === 403 && message === SUSPENDED))) {
      tokens = null;
      onTokens(null, res.status === 403 ? message : undefined);
    }
    throw new ApiError(res.status, message);
  }
  return json as T;
}

async function send(path: string, { method = "GET", body, auth = true }: Options) {
  const multipart = body instanceof FormData;
  // Çok parçalı gövdede content-type'ı fetch sınır (boundary) ile kendi yazar
  const headers: Record<string, string> = multipart ? {} : { "content-type": "application/json" };
  if (auth && tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  try {
    return await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
  }
}

/** Aynı anda gelen 401'ler tek yenileme isteği paylaşır (API eski yenileme belirtecini ikinci kullanımda reddeder). */
function refresh(): Promise<boolean> {
  if (!tokens) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      const res = await send("/auth/refresh", { method: "POST", body: { refreshToken: tokens!.refreshToken }, auth: false });
      if (!res.ok) return false;
      tokens = (await res.json()) as Tokens;
      onTokens(tokens);
      return true;
      // Ağ hatası yukarı geçer (ApiError 0): bağlantı koptu diye oturum kapatılmaz
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function messageOf(json: unknown, status: number): string {
  // Şema hatası: { message: "Geçersiz istek", errors: [{ path, message }] } — ilk alan hatası daha açıklayıcı
  const detail = (json as { errors?: { message?: unknown }[] } | null)?.errors?.[0]?.message;
  if (typeof detail === "string") return detail;
  const m = (json as { message?: unknown } | null)?.message;
  if (typeof m === "string") return m;
  if (Array.isArray(m) && typeof m[0] === "string") return m[0];
  return status === 429 ? "Çok fazla deneme yaptınız; biraz sonra tekrar deneyin." : "Bir sorun oluştu; tekrar deneyin.";
}
