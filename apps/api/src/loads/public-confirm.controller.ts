import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { confirmLoadSchema, type ConfirmLoadInput } from "@nakliye/shared";
import { ZodPipe } from "../common/zod.pipe.js";
import { ConfirmationService } from "./confirmation.service.js";
import { LoadsService } from "./loads.service.js";

const INVALID = "Bağlantı geçersiz ya da kullanılmış. Güncel durumu uygulamadan görebilirsiniz.";

/**
 * SMS'teki teyit linki (docs/04 §5 adım 3): giriş gerektirmez, tek kullanımlık token.
 * Web sayfası (/t/:token) önce GET ile ilanı gösterir, kullanıcının seçimini POST eder.
 */
@Controller("public/confirm")
export class PublicConfirmController {
  constructor(
    private readonly confirmation: ConfirmationService,
    private readonly loads: LoadsService,
  ) {}

  @Get(":token")
  async show(@Param("token") token: string) {
    const row = await this.confirmation.findByToken(token);
    if (!row) throw new NotFoundException(INVALID);
    const l = row.load;
    return {
      origin: row.origin,
      dest: row.dest,
      loadFrom: l.loadFrom,
      loadTo: l.loadTo,
      cargoType: l.cargoType,
      weightTon: l.weightTon,
      vehicleType: l.vehicleType,
      priceType: l.priceType,
      price: l.price,
      status: l.status,
      askedAt: row.askedAt,
    };
  }

  @Post(":token")
  @HttpCode(200)
  async answer(@Param("token") token: string, @Body(new ZodPipe(confirmLoadSchema)) body: ConfirmLoadInput) {
    const row = await this.confirmation.findByToken(token);
    if (!row) throw new NotFoundException(INVALID);
    const status = await this.loads.applyAnswer(row.load, body.answer, "sms");
    return { status };
  }
}
