import { Injectable } from '@nestjs/common';
import { hmacHex, safeEqualText } from '../../../common/security/crypto.js';
import { requestJson } from '../http.js';

export interface ZoomMeeting { id: number | string; uuid?: string; join_url: string; start_url?: string; registration_url?: string; status?: string; start_time?: string; duration?: number }
export interface ZoomParticipant { id?: string; user_id?: string; name?: string; user_email?: string; join_time: string; leave_time: string; duration?: number; registrant_id?: string }

/**
 * Zoom con app Server-to-Server OAuth (flujo 01). Variables: ZOOM_ACCOUNT_ID,
 * ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_USER_ID (por defecto "me") y
 * ZOOM_WEBHOOK_SECRET. El reporte de participantes exige plan de pago (Pro o superior).
 */
@Injectable()
export class ZoomClient {
  private token?: { value: string; expiresAt: number };
  private readonly base = 'https://api.zoom.us/v2';

  get configured() {
    return !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
  }

  get webhookConfigured() {
    return !!process.env.ZOOM_WEBHOOK_SECRET;
  }

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
    const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID!)}`;
    const data = await requestJson<{ access_token: string; expires_in: number }>(url, { provider: 'Zoom OAuth', method: 'POST', headers: { Authorization: `Basic ${basic}` } });
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async call<T>(method: string, path: string, body?: unknown) {
    return requestJson<T>(`${this.base}${path}`, { provider: 'Zoom', method, body, headers: { Authorization: `Bearer ${await this.accessToken()}` } });
  }

  createMeeting(input: { topic: string; startTime: Date; durationMinutes: number; agenda?: string; registration: boolean }) {
    const userId = encodeURIComponent(process.env.ZOOM_USER_ID || 'me');
    return this.call<ZoomMeeting>('POST', `/users/${userId}/meetings`, {
      topic: input.topic.slice(0, 200),
      type: 2,
      start_time: input.startTime.toISOString(),
      duration: input.durationMinutes,
      timezone: 'America/Lima',
      agenda: input.agenda?.slice(0, 2000),
      settings: {
        join_before_host: false,
        waiting_room: false,
        auto_recording: process.env.ZOOM_AUTO_RECORDING || 'none',
        // approval_type 0 + registro: cada inscrito recibe su enlace único al instante.
        approval_type: input.registration ? 0 : 2,
        registration_type: 1,
        registrants_email_notification: false,
      },
    });
  }

  updateMeeting(meetingId: string, input: { topic: string; startTime: Date; durationMinutes: number; agenda?: string }) {
    return this.call<void>('PATCH', `/meetings/${encodeURIComponent(meetingId)}`, { topic: input.topic.slice(0, 200), start_time: input.startTime.toISOString(), duration: input.durationMinutes, timezone: 'America/Lima', agenda: input.agenda?.slice(0, 2000) });
  }

  getMeeting(meetingId: string) {
    return this.call<ZoomMeeting>('GET', `/meetings/${encodeURIComponent(meetingId)}`);
  }

  addRegistrant(meetingId: string, person: { email: string; firstName: string; lastName?: string }) {
    return this.call<{ registrant_id: string; join_url: string }>('POST', `/meetings/${encodeURIComponent(meetingId)}/registrants`, { email: person.email, first_name: person.firstName.slice(0, 64) || 'Participante', last_name: (person.lastName || '').slice(0, 64) });
  }

  setLivestream(meetingId: string, stream: { streamUrl: string; streamKey: string; pageUrl: string }) {
    return this.call<void>('PATCH', `/meetings/${encodeURIComponent(meetingId)}/livestream`, { stream_url: stream.streamUrl, stream_key: stream.streamKey, page_url: stream.pageUrl });
  }

  /** Reporte de participación, paginado. Incluye reconexiones como filas separadas. */
  async pastParticipants(meetingIdOrUuid: string): Promise<ZoomParticipant[]> {
    // Un UUID que empieza con "/" o contiene "//" debe codificarse dos veces (documentación de Zoom).
    const id = meetingIdOrUuid.startsWith('/') || meetingIdOrUuid.includes('//') ? encodeURIComponent(encodeURIComponent(meetingIdOrUuid)) : encodeURIComponent(meetingIdOrUuid);
    const participants: ZoomParticipant[] = [];
    let next = '';
    do {
      const page = await this.call<{ participants: ZoomParticipant[]; next_page_token?: string }>('GET', `/report/meetings/${id}/participants?page_size=300${next ? `&next_page_token=${encodeURIComponent(next)}` : ''}`);
      participants.push(...(page.participants ?? []));
      next = page.next_page_token ?? '';
    } while (next);
    return participants;
  }

  /** Firma x-zm-signature = v0=HMAC_SHA256(secreto, "v0:{timestamp}:{cuerpo}"). Rechaza mensajes de más de 5 minutos. */
  verifyWebhook(rawBody: string, timestamp: string | undefined, signature: string | undefined) {
    const secret = process.env.ZOOM_WEBHOOK_SECRET;
    if (!secret || !timestamp || !signature) return false;
    if (Math.abs(Date.now() - Number(timestamp) * 1000) > 5 * 60_000) return false;
    return safeEqualText(signature, `v0=${hmacHex(secret, `v0:${timestamp}:${rawBody}`)}`);
  }

  /** Respuesta al desafío endpoint.url_validation. */
  urlValidation(plainToken: string) {
    return { plainToken, encryptedToken: hmacHex(process.env.ZOOM_WEBHOOK_SECRET || '', plainToken) };
  }
}
