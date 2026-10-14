import { Module } from "@nestjs/common";
import { RatingsModule } from "../ratings/ratings.module.js";
import { AdminDocumentsController, DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";

/** Belgeler (FR-05, FR-50). Hesap silme, araç silme ve zamanlayıcı DocumentsService'i kullanır. */
@Module({
  imports: [RatingsModule],
  controllers: [DocumentsController, AdminDocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
