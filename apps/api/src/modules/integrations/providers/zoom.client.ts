import { Injectable } from '@nestjs/common';
import { hmacHex, safeEqualText } from '../../../common/security/crypto.js';
import { requestJson } from '../http.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';

export interface ZoomMeeting { id: number | string; uuid?: string; join_url: string; start_url?: string; registration_url?: string; status?: string; start_time?: string; duration?: number }
export interface ZoomParticipant { id?: string; user_id?: string; name?: string; user_email?: string; join_time: string; leave_time: string; duration?: number; registrant_id?: string }

/**
 * Zoom con app Server-to-Server OAuth (flujo 01). Cada institución configura su
 * Account ID, Client ID, Client Secret, usuario anfitrión (por defecto "me") y
 * secreto del webhook. El reporte de participantes exige plan Pro o superior.
 */
@Injectable()
export class ZoomClient {
  /** Un token por institución; se descarta si cambian sus credenciales. */
  private tokens = new Map<string, { value: string; expiresAt: number; credentials: string }>();
  private readonly base = 'https://api.zoom.us/v2';

  constructor(private readonly settings: PlatformSettingsService) {}

  private cfg(organizationId: string | null | undefined) {
    return this.settings.forOrganization(organizationId, 'zoom');
  }

  configured(organizationId: string | null | undefined) {
    return this.settings.isReady(organizationId, 'zoom');
  }

  webhookConfigured(organizationId: string | null | undefined) {
    return !!this.cfg(organizationId).webhookSecret;
  }

  private async accessToken(organizationId: string | null | undefined) {
    const { accountId, clientId, clientSecret } = this.cfg(organizationId);
    const credentials = `${accountId}:${clientId}:${clientSecret}`;
    const cacheKey = organizationId ?? '';
    const cached = this.tokens.get(cacheKey);
    if (cached && cached.credentials === credentials && cached.expiresAt > Date.now() + 60_000) return cached.value;
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;
    const data = await requestJson<{ access_token: string; expires_in: number }>(url, { provider: 'Zoom OAuth', method: 'POST', headers: { Authorization: `Basic ${basic}` } });
    this.tokens.set(cacheKey, { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000, credentials });
    return data.access_token;
  }

  private async call<T>(organizationId: string | null | undefined, method: string, path: string, body?: unknown) {
    return requestJson<T>(`${this.base}${path}`, { provider: 'Zoom', method, body, headers: { Authorization: `Bearer ${await this.accessToken(organizationId)}` } });
  }

  /** Prueba de conexión: datos del usuario anfitrión con las credenciales guardadas. */
  getHostUser(organizationId: string | null | undefined) {
    return this.call<{ id: string; email?: string; first_name?: string; last_name?: string }>(organizationId, 'GET', `/users/${encodeURIComponent(this.cfg(organizationId).userId || 'me')}`);
  }

  createMeeting(organizationId: string | null | undefined, input: { topic: string; startTime: Date; durationMinutes: number; agenda?: string; registration: boolean }) {
    const cfg = this.cfg(organizationId);
    return this.call<ZoomMeeting>(organizationId, 'POST', `/users/${encodeURIComponent(cfg.userId || 'me')}/meetings`, {
      topic: input.topic.slice(0, 200),
      type: 2,
      start_time: input.startTime.toISOString(),
      duration: input.durationMinutes,
      timezone: 'America/Lima',
      agenda: input.agenda?.slice(0, 2000),
      settings: {
        join_before_host: false,
        waiting_room: false,
        auto_recording: cfg.autoRecording || 'none',
        // approval_type 0 + registro: cada inscrito recibe su enlace único al instante.
        approval_type: input.registration ? 0 : 2,
        registration_type: 1,
        registrants_email_notification: false,
      },
    });
  }

  updateMeeting(organizationId: string | null | undefined, meetingId: string, input: { topic: string; startTime: Date; durationMinutes: number; agenda?: string }) {
    return this.call<void>(organizationId, 'PATCH', `/meetings/${encodeURIComponent(meetingId)}`, { topic: input.topic.slice(0, 200), start_time: input.startTime.toISOString(), duration: input.durationMinutes, timezone: 'America/Lima', agenda: input.agenda?.slice(0, 2000) });
  }

  getMeeting(organizationId: string | null | undefined, meetingId: string) {
    return this.call<ZoomMeeting>(organizationId, 'GET', `/meetings/${encodeURIComponent(meetingId)}`);
  }

  addRegistrant(organizationId: string | null | undefined, meetingId: string, person: { email: string; firstName: string; lastName?: string }) {
    return this.call<{ registrant_id: string; join_url: string }>(organizationId, 'POST', `/meetings/${encodeURIComponent(meetingId)}/registrants`, { email: person.email, first_name: person.firstName.slice(0, 64) || 'Participante', last_name: (person.lastName || '').slice(0, 64) });
  }

  setLivestream(organizationId: string | null | undefined, meetingId: string, stream: { streamUrl: string; streamKey: string; pageUrl: string }) {
    return this.call<void>(organizationId, 'PATCH', `/meetings/${encodeURIComponent(meetingId)}/livestream`, { stream_url: stream.streamUrl, stream_key: stream.streamKey, page_url: stream.pageUrl });
  }

  /** Reporte de participación, paginado. Incluye reconexiones como filas separadas. */
  async pastParticipants(organizationId: string | null | undefined, meetingIdOrUuid: string): Promise<ZoomParticipant[]> {
    // Un UUID que empieza con "/" o contiene "//" debe codificarse dos veces (documentación de Zoom).
    const id = meetingIdOrUuid.startsWith('/') || meetingIdOrUuid.includes('//') ? encodeURIComponent(encodeURIComponent(meetingIdOrUuid)) : encodeURIComponent(meetingIdOrUuid);
    const participants: ZoomParticipant[] = [];
    let next = '';
    do {
      const page = await this.call<{ participants: ZoomParticipant[]; next_page_token?: string }>(organizationId, 'GET', `/report/meetings/${id}/participants?page_size=300${next ? `&next_page_token=${encodeURIComponent(next)}` : ''}`);
      participants.push(...(page.participants ?? []));
      next = page.next_page_token ?? '';
    } while (next);
    return participants;
  }

  /** Firma x-zm-signature = v0=HMAC_SHA256(secreto, "v0:{timestamp}:{cuerpo}"). Rechaza mensajes de más de 5 minutos. */
  verifyWebhook(organizationId: string | null | undefined, rawBody: string, timestamp: string | undefined, signature: string | undefined) {
    const secret = this.cfg(organizationId).webhookSecret;
    if (!secret || !timestamp || !signature) return false;
    if (Math.abs(Date.now() - Number(timestamp) * 1000) > 5 * 60_000) return false;
    return safeEqualText(signature, `v0=${hmacHex(secret, `v0:${timestamp}:${rawBody}`)}`);
  }

  /** Respuesta al desafío endpoint.url_validation. */
  urlValidation(organizationId: string | null | undefined, plainToken: string) {
    return { plainToken, encryptedToken: hmacHex(this.cfg(organizationId).webhookSecret, plainToken) };
  }
}
