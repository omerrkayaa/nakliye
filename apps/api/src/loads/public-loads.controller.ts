import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { LoadsService } from "./loads.service.js";

/** FR-16 paylaşım sayfası (web /ilan/:shareId); girişsiz. Kimlik 10 karakter rastgele (tahmin edilemez). */
@Controller("public/loads")
export class PublicLoadsController {
  constructor(private readonly loads: LoadsService) {}

  @Get(":shareId")
  show(@Param("shareId") shareId: string) {
    if (!/^[A-Za-z0-9_-]{10}$/.test(shareId)) throw new NotFoundException("İlan bulunamadı");
    return this.loads.getPublic(shareId);
  }
}
