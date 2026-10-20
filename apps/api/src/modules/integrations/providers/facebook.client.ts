import { Injectable } from '@nestjs/common';
import { requestJson } from '../http.js';

/**
 * Facebook Live de una Página (flujo 01): Zoom empuja el stream por RTMPS al
 * endpoint que crea la Graph API. Variables: FACEBOOK_PAGE_ID,
 * FACEBOOK_PAGE_ACCESS_TOKEN (token de Página de larga duración, permiso
 * publish_video) y FACEBOOK_GRAPH_VERSION.
 */
@Injectable()
export class FacebookClient {
  get configured() {
    return !!(process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
  }

  private get base() {
    return `https://graph.facebook.com/${process.env.FACEBOOK_GRAPH_VERSION || 'v21.0'}`;
  }

  /** Crea un live programado y devuelve URL RTMPS, clave y enlace público. */
  async createLiveVideo(input: { title: string; description?: string; plannedStart: Date }) {
    const body = new URLSearchParams({
      title: input.title.slice(0, 250),
      description: (input.description || '').slice(0, 5000),
      status: 'SCHEDULED_UNPUBLISHED',
      planned_start_time: String(Math.floor(input.plannedStart.getTime() / 1000)),
      access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN!,
    });
    const created = await requestJson<{ id: string; secure_stream_url?: string; stream_url?: string }>(`${this.base}/${encodeURIComponent(process.env.FACEBOOK_PAGE_ID!)}/live_videos`, { provider: 'Facebook', method: 'POST', body });
    const details = await requestJson<{ permalink_url?: string; secure_stream_url?: string; stream_url?: string }>(`${this.base}/${encodeURIComponent(created.id)}?fields=permalink_url,secure_stream_url,stream_url&access_token=${encodeURIComponent(process.env.FACEBOOK_PAGE_ACCESS_TOKEN!)}`, { provider: 'Facebook', method: 'GET' });
    const fullUrl = details.secure_stream_url || created.secure_stream_url || details.stream_url || created.stream_url;
    if (!fullUrl) throw new Error('Facebook no devolvió la URL de transmisión');
    const cut = fullUrl.lastIndexOf('/');
    const permalink = details.permalink_url ? (details.permalink_url.startsWith('http') ? details.permalink_url : `https://www.facebook.com${details.permalink_url}`) : `https://www.facebook.com/${process.env.FACEBOOK_PAGE_ID}/videos/${created.id}`;
    return { liveId: created.id, streamUrl: fullUrl.slice(0, cut + 1), streamKey: fullUrl.slice(cut + 1), permalink };
  }

  async updateLiveVideo(liveId: string, input: { title: string; description?: string; plannedStart: Date }) {
    const body = new URLSearchParams({ title: input.title.slice(0, 250), description: (input.description || '').slice(0, 5000), planned_start_time: String(Math.floor(input.plannedStart.getTime() / 1000)), access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN! });
    await requestJson(`${this.base}/${encodeURIComponent(liveId)}`, { provider: 'Facebook', method: 'POST', body });
  }
}
