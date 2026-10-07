import { Injectable, Logger } from "@nestjs/common";

/** SMS gönderimi. Geliştirmede kodlar konsola yazılır; gerçek sağlayıcı (Netgsm vb.) Faz 5 öncesi eklenecek. */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async send(phone: string, text: string): Promise<void> {
    if ((process.env.SMS_PROVIDER ?? "console") === "console") {
      this.logger.log(`[SMS → ${phone}] ${text}`);
      return;
    }
    throw new Error(`SMS sağlayıcı yapılandırılmamış: ${process.env.SMS_PROVIDER}`);
  }
}
