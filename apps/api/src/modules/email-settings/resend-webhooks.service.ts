import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { decryptCredential, encryptCredential } from '../../common/utils/encryption.util.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { config } from '../../common/config.js';

const RESEND_API_URL = 'https://api.resend.com';
const DEFAULT_EVENTS = ['email.delivered', 'email.bounced', 'email.complained', 'email.failed'];

type WebhookUpdate = {
  endpoint?: string;
  events?: string[];
  status?: 'enabled' | 'disabled';
};

@Injectable()
export class ResendWebhooksService {
  constructor(private readonly prisma: PrismaService, private readonly platform: PlatformSettingsService) {}

  async list(organizationId: string) {
    const data = await this.request(organizationId, '/webhooks');
    return {
      ...(data as Record<string, unknown>),
      managedWebhookId: (await this.settings(organizationId)).resendWebhookId || null,
    };
  }

  async get(organizationId: string, webhookId: string) {
    return this.request(organizationId, `/webhooks/${webhookId}`);
  }

  async create(organizationId: string, input: { events?: string[]; endpoint?: string }) {
    const endpoint = input.endpoint || this.publicEndpoint();
    const events = this.normalizeEvents(input.events);
    const response = await this.request(organizationId, '/webhooks', 'POST', { endpoint, events });
    const webhook = response as { id: string; signing_secret?: string };

    if (!webhook.id || !webhook.signing_secret) {
      throw new BadRequestException('Resend no devolvió el identificador o secreto del webhook.');
    }

    await this.prisma.organizationEmailSettings.update({
      where: { organizationId },
      data: {
        resendWebhookId: webhook.id,
        resendWebhookEndpoint: endpoint,
        resendWebhookEvents: events,
        resendWebhookStatus: 'enabled',
        resendWebhookSecretEncrypted: encryptCredential(webhook.signing_secret),
      },
    });

    return { ...webhook, endpoint, events, status: 'enabled', managed: true };
  }

  async update(organizationId: string, webhookId: string, input: WebhookUpdate) {
    const payload: WebhookUpdate = {};
    if (input.endpoint) payload.endpoint = input.endpoint;
    if (input.events) payload.events = this.normalizeEvents(input.events);
    if (input.status) payload.status = input.status;
    if (!Object.keys(payload).length) throw new BadRequestException('Indica al menos un cambio para el webhook.');

    const response = await this.request(organizationId, `/webhooks/${webhookId}`, 'PATCH', payload);
    const settings = await this.settings(organizationId);
    if (settings.resendWebhookId === webhookId) {
      await this.prisma.organizationEmailSettings.update({
        where: { organizationId },
        data: {
          ...(payload.endpoint ? { resendWebhookEndpoint: payload.endpoint } : {}),
          ...(payload.events ? { resendWebhookEvents: payload.events } : {}),
          ...(payload.status ? { resendWebhookStatus: payload.status } : {}),
        },
      });
    }
    return response;
  }

  async remove(organizationId: string, webhookId: string) {
    const response = await this.request(organizationId, `/webhooks/${webhookId}`, 'DELETE');
    const settings = await this.settings(organizationId);
    if (settings.resendWebhookId === webhookId) {
      await this.prisma.organizationEmailSettings.update({
        where: { organizationId },
        data: {
          resendWebhookId: null,
          resendWebhookEndpoint: null,
          resendWebhookEvents: [],
          resendWebhookStatus: null,
          resendWebhookSecretEncrypted: null,
        },
      });
    }
    return response;
  }

  async rotateSecret(organizationId: string, webhookId: string) {
    const response = await this.request(organizationId, `/webhooks/${webhookId}/signing-secret/rotate`, 'POST');
    const webhook = response as { signing_secret?: string };
    if (!webhook.signing_secret) throw new BadRequestException('Resend no devolvió el nuevo secreto firmado.');
    const settings = await this.settings(organizationId);
    if (settings.resendWebhookId === webhookId) {
      await this.prisma.organizationEmailSettings.update({
        where: { organizationId },
        data: { resendWebhookSecretEncrypted: encryptCredential(webhook.signing_secret) },
      });
    }
    return { ...webhook, secretSaved: settings.resendWebhookId === webhookId };
  }

  listEvents(organizationId: string, webhookId: string, limit?: number, after?: string) {
    const query = new URLSearchParams();
    if (limit) query.set('limit', String(Math.min(Math.max(limit, 1), 100)));
    if (after) query.set('after', after);
    return this.request(organizationId, `/webhooks/${webhookId}/events${query.size ? `?${query}` : ''}`);
  }

  getEvent(organizationId: string, webhookId: string, eventId: string) {
    return this.request(organizationId, `/webhooks/${webhookId}/events/${eventId}`);
  }

  listAttempts(organizationId: string, webhookId: string, eventId: string) {
    return this.request(organizationId, `/webhooks/${webhookId}/events/${eventId}/attempts`);
  }

  replayEvent(organizationId: string, webhookId: string, eventId: string) {
    return this.request(organizationId, `/webhooks/${webhookId}/events/${eventId}/replay`, 'POST');
  }

  private async settings(organizationId: string) {
    const settings = await this.prisma.organizationEmailSettings.findUnique({ where: { organizationId } });
    if (!settings) throw new NotFoundException('Primero guarda las credenciales de correo de la institución.');
    if (settings.defaultProvider !== 'RESEND') throw new BadRequestException('El seguimiento administrado requiere que Resend sea el proveedor activo.');
    if (!decryptCredential(settings.resendApiKeyEncrypted || '')) {
      throw new BadRequestException('Configura una API Key válida de Resend antes de administrar el webhook.');
    }
    return settings;
  }

  private publicEndpoint() {
    const configured = (this.platform.get('mail').trackingBaseUrl || config.apiPublicUrl()).trim().replace(/\/+$/, '');
    if (!configured || configured.includes('localhost')) {
      throw new BadRequestException('Define una URL pública para el seguimiento de correos en Administración > Configuración > Correo antes de crear el webhook.');
    }
    return `${configured}/email-tracking/provider-events`;
  }

  private normalizeEvents(events?: string[]) {
    const normalized = [...new Set((events?.length ? events : DEFAULT_EVENTS).map((event) => event.trim()).filter(Boolean))];
    if (!normalized.length) throw new BadRequestException('Selecciona por lo menos un evento de Resend.');
    return normalized;
  }

  private async request(organizationId: string, path: string, method = 'GET', body?: unknown) {
    const settings = await this.settings(organizationId);
    const apiKey = decryptCredential(settings.resendApiKeyEncrypted || '');
    const response = await fetch(`${RESEND_API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    const data = text ? this.parseJson(text) : { success: response.ok };
    if (!response.ok) {
      const message = (data as any)?.message || (data as any)?.name || `Resend respondió con estado ${response.status}.`;
      throw new BadRequestException(`No se pudo administrar el webhook: ${message}`);
    }
    return data;
  }

  private parseJson(value: string) {
    try { return JSON.parse(value); } catch { return { message: value }; }
  }
}
