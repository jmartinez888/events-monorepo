import { Injectable } from '@nestjs/common';
import { safeEqualText } from '../../../common/security/crypto.js';
import { requestJson } from '../http.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';

/**
 * Bot de Telegram (flujo 07). Se configura en Administración > Configuración:
 * token del bot, usuario (para el deep-link t.me/<bot>?start=<token>) y el
 * secreto de la cabecera X-Telegram-Bot-Api-Secret-Token.
 */
@Injectable()
export class TelegramClient {
  constructor(private readonly settings: PlatformSettingsService) {}

  private get cfg() {
    return this.settings.get('telegram');
  }

  get configured() {
    return this.settings.isReady('telegram');
  }

  deepLink(linkToken: string) {
    return this.configured ? `https://t.me/${this.cfg.botUsername}?start=${linkToken}` : null;
  }

  async sendMessage(chatId: string, html: string) {
    await requestJson(`https://api.telegram.org/bot${this.cfg.botToken}/sendMessage`, {
      provider: 'Telegram',
      method: 'POST',
      body: { chat_id: chatId, text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true },
    });
  }

  /** Prueba de conexión: identidad del bot. */
  getMe() {
    return requestJson<{ result: { username: string; first_name: string } }>(`https://api.telegram.org/bot${this.cfg.botToken}/getMe`, { provider: 'Telegram', method: 'GET' });
  }

  /** Registra el webhook de la API en Telegram con el secreto configurado. */
  setWebhook(url: string) {
    return requestJson(`https://api.telegram.org/bot${this.cfg.botToken}/setWebhook`, {
      provider: 'Telegram',
      method: 'POST',
      body: { url, secret_token: this.cfg.webhookSecret || undefined, allowed_updates: ['message'] },
    });
  }

  verifyWebhook(secretHeader: string | undefined) {
    const expected = this.cfg.webhookSecret;
    return !!expected && !!secretHeader && safeEqualText(secretHeader, expected);
  }
}
