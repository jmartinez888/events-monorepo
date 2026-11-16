import { Injectable } from '@nestjs/common';
import { hmacHex, safeEqualText } from '../../../common/security/crypto.js';
import { requestJson } from '../http.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';

export interface AttendanceAttendee { id: string; user_name?: string; user_email?: string; document_number?: string | null; registered_at?: string; is_external?: boolean }

/**
 * Sistema de Asistencia (attendance-control, flujo 03). Eventos es el dueño del
 * evento; Asistencia guarda un espejo. Cada institución configura URL (con /api),
 * token de la cuenta de servicio (rol ADMIN_EVENTO), secreto de firma de marcas
 * y clave con la que Asistencia registra personas nuevas.
 */
@Injectable()
export class AttendanceClient {
  constructor(private readonly settings: PlatformSettingsService) {}

  private cfg(organizationId: string | null | undefined) {
    return this.settings.forOrganization(organizationId, 'attendance');
  }

  configured(organizationId: string | null | undefined) {
    return this.settings.isReady(organizationId, 'attendance');
  }

  private call<T>(organizationId: string | null | undefined, method: string, path: string, body?: unknown) {
    const cfg = this.cfg(organizationId);
    return requestJson<T>(`${cfg.apiUrl.replace(/\/+$/, '')}${path}`, { provider: 'Asistencia', method, body, headers: { Authorization: `Bearer ${cfg.apiToken}` } });
  }

  createEvent(organizationId: string | null | undefined, input: MirrorEvent) {
    return this.call<{ id: string }>(organizationId, 'POST', '/events', this.payload(input));
  }

  updateEvent(organizationId: string | null | undefined, externalId: string, input: MirrorEvent) {
    return this.call<{ id: string }>(organizationId, 'PATCH', `/events/${encodeURIComponent(externalId)}`, this.payload(input));
  }

  /** Lectura completa del espejo: base de la reconciliación al cierre. */
  getEvent(organizationId: string | null | undefined, externalId: string) {
    return this.call<{ id: string; attendees?: AttendanceAttendee[] }>(organizationId, 'GET', `/events/${encodeURIComponent(externalId)}`);
  }

  /** Prueba de conexión: el servicio responde con el token guardado. */
  ping(organizationId: string | null | undefined) {
    return this.call<unknown>(organizationId, 'GET', '/events?limit=1');
  }

  private payload(input: MirrorEvent) {
    return {
      title: input.title.slice(0, 250),
      description: input.description?.slice(0, 5000),
      location: input.location || undefined,
      start_date: input.startDate.toISOString(),
      end_date: input.endDate.toISOString(),
      type: 'CONFERENCIA',
      requires_attendance: true,
      qr_code: `EVENTOS-${input.sessionId}`,
    };
  }

  /** Firma HMAC-SHA256 hex del cuerpo en X-Attendance-Signature. */
  verifyWebhook(organizationId: string | null | undefined, rawBody: string, signature: string | undefined) {
    const secret = this.cfg(organizationId).webhookSecret;
    if (!secret || !signature) return false;
    return safeEqualText(signature.replace(/^sha256=/, ''), hmacHex(secret, rawBody));
  }

  verifyServiceKey(organizationId: string | null | undefined, key: string | undefined) {
    const expected = this.cfg(organizationId).serviceKey;
    return !!expected && !!key && safeEqualText(key, expected);
  }
}

export interface MirrorEvent { sessionId: string; title: string; description?: string; location?: string | null; startDate: Date; endDate: Date }
