import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/** Gövdeyi @nakliye/shared içindeki zod şemasıyla doğrular; Android ve Web aynı kuralları kullanır. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

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
