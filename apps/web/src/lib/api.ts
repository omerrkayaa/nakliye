import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, API_URL } from "./session";

const INVALID_SESSION = "/giris?oturum=gecersiz";

/** API'nin döndürdüğü hata (mesaj kullanıcıya gösterilebilir Türkçe metindir). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Şema hatasında alan → mesaj (formda alanın altında gösterilir) */
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** false: oturumsuz uç nokta (OTP, SMS teyit linki) */
  auth?: boolean;
}

/**
 * Sunucudan API çağrısı (sunucu bileşenleri ve server action'lar). Belirteç httpOnly çerezden okunur.
 * Belirteç yoksa ya da API reddederse (ör. JWT anahtarı değişti) giriş sayfasına; yan etkili bir GET adresi
 * (çerez silen) kullanılmaz, çünkü link önyüklemesi onu da çağırabilir. Yeni giriş çerezlerin üzerine yazar.
 */
export async function api<T>(path: string, { method = "GET", body, auth = true }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (!token) redirect(INVALID_SESSION);
    headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(API_URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 401 && auth) redirect(INVALID_SESSION);
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageOf(json, res.status), fieldsOf(json));
  return json as T;
}

function fieldsOf(json: unknown): Record<string, string> {
  const errors = (json as { errors?: { path?: unknown; message?: unknown }[] } | null)?.errors ?? [];
  const out: Record<string, string> = {};
  for (const e of errors) if (typeof e.path === "string" && typeof e.message === "string" && !(e.path in out)) out[e.path] = e.message;
  return out;
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
