import { Injectable } from '@nestjs/common';
import { safeEqualText } from '../../../common/security/crypto.js';
import { requestJson } from '../http.js';

/**
 * Bot de Telegram (flujo 07). Variables: TELEGRAM_BOT_TOKEN,
 * TELEGRAM_BOT_USERNAME (para el deep-link t.me/<bot>?start=<token>) y
 * TELEGRAM_WEBHOOK_SECRET (cabecera X-Telegram-Bot-Api-Secret-Token).
 */
@Injectable()
export class TelegramClient {
  get configured() {
    return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
  }

  deepLink(linkToken: string) {
    return this.configured ? `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${linkToken}` : null;
  }

  async sendMessage(chatId: string, html: string) {
    await requestJson(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      provider: 'Telegram',
      method: 'POST',
      body: { chat_id: chatId, text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true },
    });
  }

  verifyWebhook(secretHeader: string | undefined) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    return !!expected && !!secretHeader && safeEqualText(secretHeader, expected);
  }
}
