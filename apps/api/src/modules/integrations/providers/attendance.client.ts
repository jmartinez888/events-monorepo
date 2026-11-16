import { Injectable } from '@nestjs/common';
import { hmacHex, safeEqualText } from '../../../common/security/crypto.js';
import { requestJson } from '../http.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';

export interface AttendanceAttendee { id: string; user_name?: string; user_email?: string; document_number?: string | null; registered_at?: string; is_external?: boolean }

/**
 * Sistema de Asistencia del IIAP (attendance-control, flujo 03). Eventos es el
 * dueño del evento; Asistencia guarda un espejo. Se configura en Administración:
 * URL (con /api), token de la cuenta de servicio (rol ADMIN_EVENTO), secreto de
 * firma de marcas entrantes y clave con la que Asistencia registra personas nuevas.
 */
@Injectable()
export class AttendanceClient {
  constructor(private readonly settings: PlatformSettingsService) {}

  private get cfg() {
    return this.settings.get('attendance');
  }

  get configured() {
    return this.settings.isReady('attendance');
  }

  private get base() {
    return this.cfg.apiUrl.replace(/\/+$/, '');
  }

  private call<T>(method: string, path: string, body?: unknown) {
    return requestJson<T>(`${this.base}${path}`, { provider: 'Asistencia', method, body, headers: { Authorization: `Bearer ${this.cfg.apiToken}` } });
  }

  createEvent(input: MirrorEvent) {
    return this.call<{ id: string }>('POST', '/events', this.payload(input));
  }

  updateEvent(externalId: string, input: MirrorEvent) {
    return this.call<{ id: string }>('PATCH', `/events/${encodeURIComponent(externalId)}`, this.payload(input));
  }

  /** Lectura completa del espejo: base de la reconciliación al cierre. */
  getEvent(externalId: string) {
    return this.call<{ id: string; attendees?: AttendanceAttendee[] }>('GET', `/events/${encodeURIComponent(externalId)}`);
  }

  /** Prueba de conexión: el servicio responde con el token guardado. */
  ping() {
    return this.call<unknown>('GET', '/events?limit=1');
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
  verifyWebhook(rawBody: string, signature: string | undefined) {
    const secret = this.cfg.webhookSecret;
    if (!secret || !signature) return false;
    return safeEqualText(signature.replace(/^sha256=/, ''), hmacHex(secret, rawBody));
  }

  verifyServiceKey(key: string | undefined) {
    const expected = this.cfg.serviceKey;
    return !!expected && !!key && safeEqualText(key, expected);
  }
}

export interface MirrorEvent { sessionId: string; title: string; description?: string; location?: string | null; startDate: Date; endDate: Date }
