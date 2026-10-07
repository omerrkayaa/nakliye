import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType, ZodTypeDef } from "zod";

/** Gövdeyi @nakliye/shared içindeki zod şemasıyla doğrular; Android ve Web aynı kuralları kullanır. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  // Giriş tipi serbest: şema dönüştürebilir (ör. "37.8,27.8" → {lat, lng})
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Geçersiz istek",
        errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return result.data;
  }
}
