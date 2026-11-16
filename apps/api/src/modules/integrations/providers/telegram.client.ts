import { Injectable } from '@nestjs/common';
import { safeEqualText } from '../../../common/security/crypto.js';
import { requestJson } from '../http.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';

/**
 * Bot de Telegram de cada institución (flujo 07), configurado en Configuración >
 * Integraciones: token, usuario (para el deep-link t.me/<bot>?start=<token>) y
 * secreto de la cabecera X-Telegram-Bot-Api-Secret-Token.
 */
@Injectable()
export class TelegramClient {
  constructor(private readonly settings: PlatformSettingsService) {}

  private cfg(organizationId: string | null | undefined) {
    return this.settings.forOrganization(organizationId, 'telegram');
  }

  configured(organizationId: string | null | undefined) {
    return this.settings.isReady(organizationId, 'telegram');
  }

  deepLink(organizationId: string | null | undefined, linkToken: string) {
    return this.configured(organizationId) ? `https://t.me/${this.cfg(organizationId).botUsername}?start=${linkToken}` : null;
  }

  async sendMessage(organizationId: string | null | undefined, chatId: string, html: string) {
    await requestJson(`https://api.telegram.org/bot${this.cfg(organizationId).botToken}/sendMessage`, {
      provider: 'Telegram',
      method: 'POST',
      body: { chat_id: chatId, text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true },
    });
  }

  /** Prueba de conexión: identidad del bot. */
  getMe(organizationId: string | null | undefined) {
    return requestJson<{ result: { username: string; first_name: string } }>(`https://api.telegram.org/bot${this.cfg(organizationId).botToken}/getMe`, { provider: 'Telegram', method: 'GET' });
  }

  /** Registra en Telegram el webhook de esta institución con su secreto. */
  setWebhook(organizationId: string | null | undefined, url: string) {
    const cfg = this.cfg(organizationId);
    return requestJson(`https://api.telegram.org/bot${cfg.botToken}/setWebhook`, {
      provider: 'Telegram',
      method: 'POST',
      body: { url, secret_token: cfg.webhookSecret || undefined, allowed_updates: ['message'] },
    });
  }

  verifyWebhook(organizationId: string | null | undefined, secretHeader: string | undefined) {
    const expected = this.cfg(organizationId).webhookSecret;
    return !!expected && !!secretHeader && safeEqualText(secretHeader, expected);
  }
}
