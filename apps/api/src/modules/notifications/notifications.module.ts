import { Body, Controller, ForbiddenException, Headers, HttpCode, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { TelegramClient } from '../integrations/providers/telegram.client.js';
import { Public } from '../../common/public.decorator.js';

@Controller('webhooks/telegram')
export class TelegramWebhookController {
  constructor(private readonly notifications: NotificationsService, private readonly telegram: TelegramClient) {}

  /** Cada institución registra su bot con /webhooks/telegram/<id> y el secret_token de su configuración. */
  @Public() @Post(':organizationId') @HttpCode(200)
  async receive(@Param('organizationId', ParseUUIDPipe) organizationId: string, @Body() update: unknown, @Headers('x-telegram-bot-api-secret-token') secret?: string) {
    if (!this.telegram.verifyWebhook(organizationId, secret)) throw new ForbiddenException('Firma inválida');
    await this.notifications.handleTelegramUpdate(organizationId, update);
    return { ok: true };
  }
}

@Module({ controllers: [TelegramWebhookController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
