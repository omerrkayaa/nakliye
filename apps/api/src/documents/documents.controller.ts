import {
  Body,
  Catch,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  adminDocumentListSchema,
  DOCUMENT_LIMITS,
  reviewDocumentSchema,
  uploadDocumentSchema,
  type AdminDocumentListInput,
  type ReviewDocumentInput,
  type UploadDocumentInput,
} from "@nakliye/shared";
import type { Response } from "express";
import { AuthGuard, CurrentUser, Roles } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DocumentsService, type UploadedDocumentFile } from "./documents.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });

/** Multer'ın sınır hatası İngilizce ("File too large"): kullanıcıya Türkçe ve sınırla */
@Catch(PayloadTooLargeException)
class UploadTooLargeFilter implements ExceptionFilter {
  catch(_e: PayloadTooLargeException, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(413)
      .json({ statusCode: 413, message: `Dosya en çok ${DOCUMENT_LIMITS.maxBytes / 1024 / 1024} MB olabilir`, error: "Payload Too Large" });
  }
}

/** FR-05: belge yükleme ve kendi belgeleri; dosya 5 dk'lık imzalı bağlantıyla (docs/04 §8). */
@Controller("documents")
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Çok parçalı form: `file` (PDF/JPEG/PNG, ≤ 10 MB) + `type` + araca bağlı türde `vehicleId`. Bellekte tutulur, diske depo yazar. */
  @Post()
  @UseFilters(UploadTooLargeFilter)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: DOCUMENT_LIMITS.maxBytes, files: 1, fields: 4, parts: 6 } }))
  upload(
    @CurrentUser() user: AccessPayload,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Body(new ZodPipe(uploadDocumentSchema)) body: UploadDocumentInput,
  ) {
    return this.documents.upload(user.sub, body, file);
  }

  @Get()
  list(@CurrentUser() user: AccessPayload) {
    return this.documents.list(user.sub);
  }

  /** Sahibi ya da yönetici; `path` API kökünden (…/api/v1 + path) */
  @Get(":id/url")
  url(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string) {
    return this.documents.url(user, id);
  }
}

/** Y1 belge onay kuyruğu (FR-50) */
@Controller("admin/documents")
@UseGuards(AuthGuard)
@Roles("admin")
export class AdminDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@Query(new ZodPipe(adminDocumentListSchema)) query: AdminDocumentListInput) {
    return this.documents.adminList(query);
  }

  @Post(":id/review")
  @HttpCode(200)
  review(@CurrentUser() user: AccessPayload, @Param("id", uuid) id: string, @Body(new ZodPipe(reviewDocumentSchema)) body: ReviewDocumentInput) {
    return this.documents.review(user.sub, id, body);
  }
}
