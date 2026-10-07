import { Injectable, Logger } from "@nestjs/common";

export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
  /** Bildirimdeki eylem butonları (ör. teyit: gecerli / arac_bulundu / iptal) */
  actions?: { id: string; title: string }[];
}

/**
 * Push bildirimi. FCM henüz bağlı değil (Android uygulamasıyla birlikte eklenecek): mesaj loglanır ve
 * "teslim edilemedi" döner. Teyit akışında bu, 30 dk sonra SMS yedeğinin devreye girmesi demektir.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  async sendToUser(userId: string, msg: PushMessage): Promise<boolean> {
    this.logger.log(`[PUSH → ${userId}] ${msg.title} — ${msg.body} ${JSON.stringify(msg.data)}`);
    return false;
  }
}
