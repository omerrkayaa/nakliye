import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { DOCUMENT_LIMITS } from "@nakliye/shared";
import { and, count, eq, gte } from "drizzle-orm";
import type { Request, Response } from "express";
import { finalize, type Observable } from "rxjs";
import type { AccessPayload } from "../auth/auth.service.js";
import { DB, type Db } from "../db/db.module.js";
import { documents } from "../db/schema.js";

/** Sunucu genelinde aynı anda belleğe alınan yükleme (her biri ≤ 10 MB: en çok ~80 MB) */
const MAX_CONCURRENT_UPLOADS = 8;
/**
 * Bir yüklemenin en uzun süresi: gövdesi bitmeyen istek kesilir, yuva boşalır (çok yavaş gövdeyle 8 genel yuvayı
 * tutmak; güvenlik incelemesi 2026-10-15). 10 MB 2 dakikada ~85 KB/sn ister. UPLOAD_MAX_MS ile değişir (test).
 */
const uploadMaxMs = () => Number(process.env.UPLOAD_MAX_MS) || 2 * 60_000;

/**
 * Yükleme yuvası (belge güvenlik incelemesi bulgu 2): multer dosyayı belleğe almadan önce çalışır (UseInterceptors'ta
 * FileInterceptor'dan önce). Gövde okunmadan: belge yükleyebilen rol, 24 saatlik sınır, kullanıcı başına aynı anda tek
 * yükleme ve sunucu genelinde üst sınır — paralel isteklerle bellek şişirilemesin. Belge türü gövdede olduğu için türe
 * göre rol ve kilitli kesin sayım serviste (DocumentsService.upload) yine yapılır. Yuvalar süreç içinde: API birden çok
 * süreçle çalışırsa sınır süreç başına olur.
 */
@Injectable()
export class UploadSlotInterceptor implements NestInterceptor {
  private readonly active = new Map<string, { at: number }>();

  constructor(@Inject(DB) private readonly db: Db) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = ctx.switchToHttp();
    const user = http.getRequest<Request & { user: AccessPayload }>().user;
    if (!user.roles.some((r) => r === "carrier" || r === "shipper")) throw new ForbiddenException("Belge nakliyeci ya da yük sahibi hesabıyla yüklenir");

    const now = Date.now();
    // Yedek: süre sınırına rağmen boşalmamış yuva
    for (const [id, slot] of this.active) if (now - slot.at > uploadMaxMs() + 10_000) this.active.delete(id);
    if (this.active.has(user.sub)) throw new HttpException("Önceki yüklemeniz sürüyor; bitince tekrar deneyin.", HttpStatus.TOO_MANY_REQUESTS);
    if (this.active.size >= MAX_CONCURRENT_UPLOADS) throw new HttpException("Şu an çok sayıda yükleme yapılıyor; biraz sonra tekrar deneyin.", HttpStatus.SERVICE_UNAVAILABLE);
    // Denetim ve ayırma arasında await yok: aynı kullanıcının paralel istekleri yarışamaz
    const slot = { at: now };
    this.active.set(user.sub, slot);
    const req = http.getRequest<Request>();
    const timer = setTimeout(() => req.destroy(), uploadMaxMs());
    const release = () => {
      clearTimeout(timer);
      if (this.active.get(user.sub) === slot) this.active.delete(user.sub);
    };
    // İstemci yükleme ortasında koparsa da, süre dolup istek kesilince de yuva boşalır
    http.getResponse<Response>().on("close", release);
    try {
      const [day] = await this.db
        .select({ n: count() })
        .from(documents)
        .where(and(eq(documents.ownerUserId, user.sub), gte(documents.createdAt, new Date(now - 24 * 3_600_000))));
      if ((day?.n ?? 0) >= DOCUMENT_LIMITS.uploadsPerDay) throw new HttpException("Bugün çok belge yüklediniz; yarın tekrar deneyin", HttpStatus.TOO_MANY_REQUESTS);
    } catch (e) {
      release();
      throw e;
    }
    return next.handle().pipe(finalize(release));
  }
}
