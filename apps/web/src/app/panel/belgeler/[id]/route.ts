import { api, ApiError } from "@/lib/api";
import { API_URL } from "@/lib/session";

/**
 * Belge dosyasını açar (FR-05, Y1). BFF: tarayıcı API'yi görmez; oturumdaki kullanıcının (sahibi ya da yönetici) 5 dk'lık
 * imzalı yolu alınır, dosya buradan aktarılır. Güvenlik başlıkları API'deki gibi (nosniff, önbelleksiz, görselde CSP).
 */
export async function GET(_req: Request, ctx: RouteContext<"/panel/belgeler/[id]">) {
  const { id } = await ctx.params;
  let path: string;
  try {
    ({ path } = await api<{ path: string }>(`/documents/${encodeURIComponent(id)}/url`));
  } catch (e) {
    if (e instanceof ApiError) return new Response("Belge bulunamadı", { status: 404 });
    throw e;
  }
  const file = await fetch(API_URL + path, { cache: "no-store" });
  if (!file.ok || !file.body) return new Response("Belge bulunamadı", { status: 404 });
  const type = file.headers.get("content-type") ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "content-type": type,
    "content-disposition": file.headers.get("content-disposition") ?? "inline",
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
  };
  const csp = file.headers.get("content-security-policy");
  if (csp) headers["content-security-policy"] = csp;
  return new Response(file.body, { headers });
}
