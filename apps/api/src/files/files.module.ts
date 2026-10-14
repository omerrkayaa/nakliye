import { Global, Module } from "@nestjs/common";
import { FILE_STORAGE, LocalDiskStorage } from "./file-storage.js";
import { FilesController } from "./files.controller.js";

/** Global: belge modülü yazar, hesap silme ve araç silme dosyaları siler. */
@Global()
@Module({
  controllers: [FilesController],
  providers: [{ provide: FILE_STORAGE, useClass: LocalDiskStorage }],
  exports: [FILE_STORAGE],
})
export class FilesModule {}
