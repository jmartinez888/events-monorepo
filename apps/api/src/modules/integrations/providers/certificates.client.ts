import { Injectable } from '@nestjs/common';
import { requestJson } from '../http.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';

export interface CertificateIssueRequest {
  idempotencyKey: string;
  person: { directoryPersonId: string; firstName: string; lastName: string; documentType?: string | null; documentNumber?: string | null; email?: string | null };
  event: { id: string; name: string; editionId: string; editionName: string; startDate: string; endDate?: string | null };
  role: { id: string; code: string; label: string; templateId?: string | null; hours: number; text?: string | null };
  version: number;
}

export interface CertificateIssueResponse { id: string; code: string; status: string; verifyUrl?: string }

/**
 * Sistema de Certificados del IIAP (flujo 05). URL y API key (X-API-Key con
 * permiso de emisión) se configuran en Administración > Configuración.
 *
 * Contrato PROPUESTO: POST {url}/api/v1/certificates/issue con cabecera
 * Idempotency-Key. Sin URL y clave, Eventos emite y verifica localmente.
 */
@Injectable()
export class CertificatesClient {
  constructor(private readonly settings: PlatformSettingsService) {}

  get configured() {
    return this.settings.isReady('certificates');
  }

  issue(request: CertificateIssueRequest) {
    const cfg = this.settings.get('certificates');
    return requestJson<CertificateIssueResponse>(`${cfg.apiUrl.replace(/\/+$/, '')}/api/v1/certificates/issue`, {
      provider: 'Certificados',
      method: 'POST',
      body: request,
      headers: { 'X-API-Key': cfg.apiKey, 'Idempotency-Key': request.idempotencyKey },
      timeoutMs: 60_000,
    });
  }
}
