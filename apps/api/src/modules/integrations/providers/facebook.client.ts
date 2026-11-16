import { Injectable } from '@nestjs/common';
import { requestJson } from '../http.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';

interface LiveInput { title: string; description?: string; plannedStart: Date }

/**
 * Facebook Live de la Página de cada institución (flujo 01): Zoom empuja el
 * stream por RTMPS al endpoint que crea la Graph API. Página, token de larga
 * duración (permiso publish_video) y versión se configuran por institución.
 */
@Injectable()
export class FacebookClient {
  constructor(private readonly settings: PlatformSettingsService) {}

  private cfg(organizationId: string | null | undefined) {
    return this.settings.forOrganization(organizationId, 'facebook');
  }

  configured(organizationId: string | null | undefined) {
    return this.settings.isReady(organizationId, 'facebook');
  }

  private base(organizationId: string | null | undefined) {
    return `https://graph.facebook.com/${this.cfg(organizationId).graphVersion || 'v21.0'}`;
  }

  /** Crea un live programado y devuelve URL RTMPS, clave y enlace público. */
  async createLiveVideo(organizationId: string | null | undefined, input: LiveInput) {
    const { pageId, pageAccessToken } = this.cfg(organizationId);
    const base = this.base(organizationId);
    const body = new URLSearchParams({
      title: input.title.slice(0, 250),
      description: (input.description || '').slice(0, 5000),
      status: 'SCHEDULED_UNPUBLISHED',
      planned_start_time: String(Math.floor(input.plannedStart.getTime() / 1000)),
      access_token: pageAccessToken,
    });
    const created = await requestJson<{ id: string; secure_stream_url?: string; stream_url?: string }>(`${base}/${encodeURIComponent(pageId)}/live_videos`, { provider: 'Facebook', method: 'POST', body });
    const details = await requestJson<{ permalink_url?: string; secure_stream_url?: string; stream_url?: string }>(`${base}/${encodeURIComponent(created.id)}?fields=permalink_url,secure_stream_url,stream_url&access_token=${encodeURIComponent(pageAccessToken)}`, { provider: 'Facebook', method: 'GET' });
    const fullUrl = details.secure_stream_url || created.secure_stream_url || details.stream_url || created.stream_url;
    if (!fullUrl) throw new Error('Facebook no devolvió la URL de transmisión');
    const cut = fullUrl.lastIndexOf('/');
    const permalink = details.permalink_url ? (details.permalink_url.startsWith('http') ? details.permalink_url : `https://www.facebook.com${details.permalink_url}`) : `https://www.facebook.com/${pageId}/videos/${created.id}`;
    return { liveId: created.id, streamUrl: fullUrl.slice(0, cut + 1), streamKey: fullUrl.slice(cut + 1), permalink };
  }

  async updateLiveVideo(organizationId: string | null | undefined, liveId: string, input: LiveInput) {
    const body = new URLSearchParams({ title: input.title.slice(0, 250), description: (input.description || '').slice(0, 5000), planned_start_time: String(Math.floor(input.plannedStart.getTime() / 1000)), access_token: this.cfg(organizationId).pageAccessToken });
    await requestJson(`${this.base(organizationId)}/${encodeURIComponent(liveId)}`, { provider: 'Facebook', method: 'POST', body });
  }

  /** Prueba de conexión: nombre de la Página con el token guardado. */
  getPage(organizationId: string | null | undefined) {
    const { pageId, pageAccessToken } = this.cfg(organizationId);
    return requestJson<{ id: string; name: string }>(`${this.base(organizationId)}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(pageAccessToken)}`, { provider: 'Facebook', method: 'GET' });
  }
}
