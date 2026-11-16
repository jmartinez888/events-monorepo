import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { decryptCredential } from '../../common/utils/encryption.util.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { config } from '../../common/config.js';

type ProviderEvent = { type?: string; data?: Record<string, any>; [key: string]: any };

@Injectable()
export class EmailTrackingService {
  constructor(private readonly prisma: PrismaService, private readonly platform: PlatformSettingsService) {}

  private get baseUrl() {
    return String(this.platform.get('mail').trackingBaseUrl || config.apiPublicUrl()).replace(/\/+$/, '');
  }

  unsubscribeUrl(token: string) { return `${this.baseUrl}/email-tracking/unsubscribe/${token}`; }

  decorateHtml(html: string, token: string) {
    const unsubscribe = this.unsubscribeUrl(token);
    const tracked = html.replace(/<a\b([^>]*?)href=(['"])(.*?)\2([^>]*)>/gi, (anchor, before, quote, href, after) => {
      const target = String(href || '').replace(/&amp;/g, '&').trim();
      if (!/^https?:\/\//i.test(target) || target === unsubscribe || target.includes('/email-tracking/')) return anchor;
      const redirect = `${this.baseUrl}/email-tracking/click/${token}?url=${encodeURIComponent(target)}`;
      return `<a${before}href=${quote}${redirect}${quote}${after}>`;
    });
    const pixel = `<img src="${this.baseUrl}/email-tracking/open/${token}" width="1" height="1" alt="" style="display:block;border:0;outline:none" />`;
    // Toda campaña debe ofrecer una baja funcional, aunque la plantilla no haya
    // incluido manualmente la variable {{unsubscribe_url}}.
    const footer = tracked.includes(unsubscribe)
      ? ''
      : `<div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #e5e7eb;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280">Recibiste este correo porque te suscribiste a comunicaciones de esta institución.<br /><a href="${unsubscribe}" style="color:#4f46e5;text-decoration:underline">Cancelar suscripción</a></div>`;
    return /<\/body\s*>/i.test(tracked) ? tracked.replace(/<\/body\s*>/i, `${footer}${pixel}</body>`) : `${tracked}${footer}${pixel}`;
  }

  async recordOpen(token: string, metadata: Record<string, unknown> = {}) {
    const delivery = await this.delivery(token);
    await this.prisma.$transaction([
      this.prisma.emailDelivery.update({ where: { id: delivery.id }, data: { openedAt: delivery.openedAt || new Date(), openCount: { increment: 1 } } }),
      this.prisma.emailTrackingEvent.create({ data: { deliveryId: delivery.id, type: 'OPEN', metadata: metadata as any } }),
    ]);
  }

  async recordClick(token: string, url: string, metadata: Record<string, unknown> = {}) {
    const delivery = await this.delivery(token);
    await this.prisma.$transaction([
      this.prisma.emailDelivery.update({ where: { id: delivery.id }, data: { clickedAt: delivery.clickedAt || new Date(), clickCount: { increment: 1 } } }),
      this.prisma.emailTrackingEvent.create({ data: { deliveryId: delivery.id, type: 'CLICK', url, metadata: metadata as any } }),
    ]);
  }

  async unsubscribe(token: string, metadata: Record<string, unknown> = {}) {
    const delivery = await this.delivery(token);
    await this.prisma.$transaction(async (tx) => {
      if (delivery.contactId) await tx.marketingContact.update({ where: { id: delivery.contactId }, data: { consentStatus: 'UNSUBSCRIBED', unsubscribedAt: new Date() } });
      await tx.emailTrackingEvent.create({ data: { deliveryId: delivery.id, type: 'UNSUBSCRIBE', metadata: metadata as any } });
    });
    return delivery;
  }

  async verifyResendWebhook(rawBody: Buffer | undefined, headers: { id?: string; timestamp?: string; signature?: string }) {
    if (!rawBody || !headers.id || !headers.timestamp || !headers.signature) throw new UnauthorizedException('Firma de webhook incompleta');
    const settings = await this.prisma.organizationEmailSettings.findMany({ where: { defaultProvider: 'RESEND', isActive: true, resendWebhookSecretEncrypted: { not: null } }, select: { resendWebhookSecretEncrypted: true } });
    const secrets = [...settings.map((item) => decryptCredential(item.resendWebhookSecretEncrypted || '')).filter(Boolean), this.platform.get('mail').resendWebhookSecret];
    if (!secrets.length || !secrets.some(Boolean)) throw new UnauthorizedException('No hay un secreto webhook de Resend configurado');
    const signed = `${headers.id}.${headers.timestamp}.${rawBody.toString('utf8')}`;
    const signatures = headers.signature.split(' ').map((part) => part.split(',')).filter(([version, value]) => version === 'v1' && Boolean(value)).map(([, value]) => value);
    const valid = secrets.some((secret) => this.matchesSignature(secret, signed, signatures));
    if (!valid) throw new UnauthorizedException('Firma de Resend no válida');
  }

  private matchesSignature(secret: string, signed: string, signatures: string[]) {
    const expected = createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(signed).digest('base64');
    return signatures.some((signature) => {
      const received = Buffer.from(signature, 'base64');
      const calculated = Buffer.from(expected, 'base64');
      return received.length === calculated.length && timingSafeEqual(received, calculated);
    });
  }

  async providerEvent(input: ProviderEvent) {
    const data = input.data || input;
    const providerMessageId = data.email_id || data.message_id || data.id || input.email_id || input.message_id;
    if (!providerMessageId) return { ignored: true, reason: 'El evento no contiene el identificador del proveedor' };
    const delivery = await this.prisma.emailDelivery.findFirst({ where: { providerMessageId: String(providerMessageId) } });
    if (!delivery) return { ignored: true, reason: 'No existe un envío asociado' };
    const rawType = String(input.type || data.type || '').toLowerCase();
    const mapped = rawType.includes('deliver') ? 'DELIVERED' : rawType.includes('bounce') ? 'BOUNCE' : rawType.includes('complaint') || rawType.includes('spam') ? 'COMPLAINT' : rawType.includes('failed') ? 'FAILED' : null;
    if (!mapped) return { ignored: true, reason: `Evento no soportado: ${rawType || 'sin tipo'}` };
    const now = new Date();
    const status = mapped === 'DELIVERED' ? 'DELIVERED' : mapped === 'BOUNCE' ? 'BOUNCED' : 'COMPLAINED';
    await this.prisma.$transaction(async (tx) => {
      await tx.emailDelivery.update({ where: { id: delivery.id }, data: { status, ...(mapped === 'DELIVERED' ? { deliveredAt: now } : {}), ...(mapped === 'BOUNCE' ? { bouncedAt: now } : {}), ...(mapped === 'COMPLAINT' ? { complainedAt: now } : {}) } });
      await tx.emailTrackingEvent.create({ data: { deliveryId: delivery.id, type: mapped, metadata: input as any } });
      if (delivery.contactId && (mapped === 'BOUNCE' || mapped === 'COMPLAINT')) await tx.marketingContact.update({ where: { id: delivery.contactId }, data: { consentStatus: mapped === 'COMPLAINT' ? 'UNSUBSCRIBED' : undefined, unsubscribedAt: mapped === 'COMPLAINT' ? now : undefined } });
    });
    return { ignored: false, type: mapped, deliveryId: delivery.id };
  }

  async analytics(organizationId: string) {
    const [total, opened, clicked, statuses] = await Promise.all([
      this.prisma.emailDelivery.count({ where: { organizationId } }),
      this.prisma.emailDelivery.count({ where: { organizationId, openedAt: { not: null } } }),
      this.prisma.emailDelivery.count({ where: { organizationId, clickedAt: { not: null } } }),
      this.prisma.emailDelivery.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
    ]);
    return { total, uniqueOpens: opened, uniqueClicks: clicked, openRate: total ? Number((opened * 100 / total).toFixed(2)) : 0, clickRate: total ? Number((clicked * 100 / total).toFixed(2)) : 0, statuses: Object.fromEntries(statuses.map((item) => [item.status, item._count._all])) };
  }

  private async delivery(token: string) {
    const delivery = await this.prisma.emailDelivery.findUnique({ where: { trackingToken: token } });
    if (!delivery) throw new NotFoundException('Seguimiento no encontrado');
    return delivery;
  }
}
