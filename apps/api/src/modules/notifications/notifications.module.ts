import { Body, Controller, ForbiddenException, Headers, HttpCode, Module, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { TelegramClient } from '../integrations/providers/telegram.client.js';
import { Public } from '../../common/public.decorator.js';

@Controller('webhooks/telegram')
export class TelegramWebhookController {
  constructor(private readonly notifications: NotificationsService, private readonly telegram: TelegramClient) {}

  /** Telegram envía la cabecera secreta configurada con setWebhook(secret_token). */
  @Public() @Post() @HttpCode(200)
  async receive(@Body() update: unknown, @Headers('x-telegram-bot-api-secret-token') secret?: string) {
    if (!this.telegram.verifyWebhook(secret)) throw new ForbiddenException('Firma inválida');
    await this.notifications.handleTelegramUpdate(update);
    return { ok: true };
  }
}

@Module({ controllers: [TelegramWebhookController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
