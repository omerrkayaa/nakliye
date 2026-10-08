import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookie, refreshCookie, refreshTokens } from "@/lib/session";

/**
 * Panel girişi ve belirteç yenileme. Erişim çerezi düşmüşse (14 dk) refresh ile yenilenir; yeni çerez hem
 * tarayıcıya (yanıt) hem bu isteğe (sunucu bileşenleri ve server action'lar aynı istekte görsün) yazılır.
 *
 * Yenileme başarısız olunca çerezler SİLİNMEZ, yalnız girişe yönlendirilir: erişim çerezi yokken iki istek
 * (ör. link önyüklemeleri) aynı anda yenilerse ikincisi kullanılmış refresh'le reddedilir (API tek kullanımlık);
 * silseydik birincinin yazdığı geçerli çerezleri de ezip kullanıcıyı çıkarırdık. Giriş sayfası geçerli erişim
 * çerezi görürse panele geri gönderir; refresh gerçekten geçersizse yeni girişte üzerine yazılır.
 */
export async function proxy(req: NextRequest) {
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;

  if (req.nextUrl.pathname === "/giris") {
    // oturum=gecersiz: API çerezdeki belirteci reddetti (lib/api); panele geri göndermek döngü olurdu
    const invalid = req.nextUrl.searchParams.has("oturum");
    return access && !invalid ? NextResponse.redirect(new URL("/panel", req.url)) : NextResponse.next();
  }
  if (access) return NextResponse.next();

  const tokens = refresh ? await refreshTokens(refresh) : null;
  if (!tokens) return toLogin(req);

  req.cookies.set(ACCESS_COOKIE, tokens.accessToken);
  req.cookies.set(REFRESH_COOKIE, tokens.refreshToken);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(accessCookie(tokens.accessToken));
  res.cookies.set(refreshCookie(tokens.refreshToken));
  return res;
}

function toLogin(req: NextRequest) {
  const url = new URL("/giris", req.url);
  url.searchParams.set("sonra", req.nextUrl.pathname);
  return NextResponse.redirect(url, 303);
}

export const config = { matcher: ["/panel/:path*", "/giris"] };
