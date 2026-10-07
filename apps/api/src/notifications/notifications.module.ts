import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { PushService } from "./push.service.js";

/** Global: teyit, eşleştirme ve ileride teklif/iş modülleri bildirim gönderir. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
