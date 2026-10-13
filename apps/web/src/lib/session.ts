// Oturum çerezleri. Belirteçler yalnız sunucuda kullanılır (httpOnly): tarayıcıdaki JavaScript okuyamaz, XSS çalamaz.
// Bu dosya proxy.ts'den de içe aktarıldığı için next/headers kullanmaz.

export const ACCESS_COOKIE = "nk_at";
export const REFRESH_COOKIE = "nk_rt";

export const API_URL = process.env.API_URL ?? "http://localhost:3000/api/v1";

/** API erişim belirteci 15 dk geçerli; çerez 1 dk önce düşer: çerez varsa belirteç geçerlidir, yoksa proxy yeniler. */
const ACCESS_MAX_AGE = 14 * 60;
/** API'deki refresh süresiyle aynı (30 gün) */
const REFRESH_MAX_AGE = 30 * 24 * 3600;

const base = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } as const;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Yalnız girişte: dondurulan hesap açıldı ya da silinen hesap süresi içinde geri açıldı */
  reopened?: "dondurma" | "silme";
}

export const accessCookie = (value: string) => ({ name: ACCESS_COOKIE, value, ...base, maxAge: ACCESS_MAX_AGE });
export const refreshCookie = (value: string) => ({ name: REFRESH_COOKIE, value, ...base, maxAge: REFRESH_MAX_AGE });

/** Refresh belirteciyle yeni çift alır (API tek kullanımlık döndürür: eskisi geçersizleşir). Geçersizse null. */
export async function refreshTokens(refreshToken: string): Promise<Tokens | null> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });
  return res.ok ? ((await res.json()) as Tokens) : null;
}
