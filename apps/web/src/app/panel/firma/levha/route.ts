import { DOCUMENT_LIMITS } from "@nakliye/shared";
import { api, ApiError } from "@/lib/api";

const MB = DOCUMENT_LIMITS.maxBytes / 1024 / 1024;
/** Dosya + çok parçalı form başlıkları için pay */
const MAX_BODY = DOCUMENT_LIMITS.maxBytes + 64 * 1024;
const fail = (error: string, status: number) => Response.json({ error }, { status });

/**
 * Vergi levhası yükleme (FR-05). Sunucu eylemi değil rota işleyicisi: eylemlerin gövde sınırını belge boyutuna
 * yükseltmek giriş dahil tüm eylemlere uygulanırdı (belge güvenlik incelemesi bulgu 5; eylemler artık varsayılan 1 MB).
 * Sunucu eylemlerindeki köken (CSRF) denetimi burada elle yapılır. Dosya API'ye çok parçalı gider; tür API'de ilk
 * baytlardan denetlenir.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Geçersiz istek", 403);
  // Gövde okunmadan: uzunluk bildirilmemiş ya da sınırı aşan istek
  const length = req.headers.get("content-length");
  if (length === null) return fail("Dosya boyutu bildirilmedi", 411);
  if (!(Number(length) <= MAX_BODY)) return fail(`Dosya en çok ${MB} MB olabilir`, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Dosya okunamadı; tekrar deneyin", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Dosya seçin", 400);
  if (file.size > DOCUMENT_LIMITS.maxBytes) return fail(`Dosya en çok ${MB} MB olabilir`, 413);
  const body = new FormData();
  body.append("type", "vergi_levhasi");
  body.append("file", file, file.name);
  try {
    await api("/documents", { method: "POST", body });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.message, e.status);
    throw e;
  }
  return Response.json({ ok: true }, { status: 201 });
}

/** İstek bu sitenin sayfasından mı (tarayıcı başka siteden gelen istekte Origin'i o site yazar) */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
