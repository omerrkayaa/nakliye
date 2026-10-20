import { Injectable } from "@nestjs/common";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Dosya deposu arayüzü (S3 benzeri: anahtarla koy/al/sil). 2026-10-12 kararı: şimdilik yerel disk; yayına yakın
 * gerçek depoya (S3 uyumlu) geçilirken yalnız bu arayüzün başka bir gerçekleştirmesi yazılır.
 */
export interface FileStorage {
  put(key: string, body: Buffer): Promise<void>;
  /** Yoksa null */
  get(key: string): Promise<Buffer | null>;
  /** Yoksa da başarılı (tekrar çalıştırılabilir) */
  delete(key: string): Promise<void>;
}
export const FILE_STORAGE = Symbol("FILE_STORAGE");

/** Anahtar biçimi sunucuda üretilir: documents/<sahip>/<belge>.<uzantı>. Dışarıdan gelen anahtar bu kalıba uymalı. */
export const FILE_KEY_RE = /^documents\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/;

/** Yerel disk: FILE_STORAGE_DIR (varsayılan çalışma klasöründe storage/). Yazma geçici dosya + rename ile (yarım dosya kalmaz). */
@Injectable()
export class LocalDiskStorage implements FileStorage {
  private readonly root = resolve(process.env.FILE_STORAGE_DIR ?? "storage");

  /** Yol geçişine karşı: kalıp + çözülen yolun kök altında kalması */
  private path(key: string) {
    if (!FILE_KEY_RE.test(key)) throw new Error(`Geçersiz dosya anahtarı: ${key}`);
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new Error(`Geçersiz dosya anahtarı: ${key}`);
    return p;
  }

  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.${randomUUID()}.tmp`;
    await writeFile(tmp, body, { flag: "wx" });
    await rename(tmp, p);
  }

  async get(key: string) {
    try {
      return await readFile(this.path(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}
