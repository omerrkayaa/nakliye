import { Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { FILE_KEY_RE, FILE_STORAGE, type FileStorage } from "./file-storage.js";
import { verifyFileUrl } from "./signed-url.js";

const TYPES = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" } as const;

/**
 * Belge dosyası (docs/04 §8): girişsiz, 5 dk geçerli imzayla. Tür sunucunun yüklemede ilk baytlardan belirlediği
 * uzantıdan; nosniff ile tarayıcı türü tahmin etmez, inline gösterilir, önbelleğe yazılmaz.
 */
@Controller("files")
export class FilesController {
  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStorage) {}

  @Get("documents/:owner/:file")
  async document(
    @Param("owner") owner: string,
    @Param("file") file: string,
    @Query("exp") exp: string | undefined,
    @Query("sig") sig: string | undefined,
    @Res() res: Response,
  ) {
    const key = `documents/${owner}/${file}`;
    if (!FILE_KEY_RE.test(key) || !verifyFileUrl(key, exp, sig)) throw new ForbiddenException("Bağlantının süresi doldu ya da geçersiz");
    const body = await this.storage.get(key);
    if (!body) throw new NotFoundException("Dosya bulunamadı");
    const ext = key.slice(key.lastIndexOf(".") + 1) as keyof typeof TYPES;
    res.set({
      "Content-Type": TYPES[ext],
      "Content-Length": String(body.length),
      "Content-Disposition": `inline; filename="belge.${ext}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      // Görsel belge sayfasında betik çalışamasın (PDF görüntüleyicisini bozmamak için PDF'te yok)
      ...(ext === "pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }),
    });
    res.send(body);
  }
}
