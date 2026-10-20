import { Injectable } from '@nestjs/common';
import { requestJson } from '../http.js';

export interface CertificateIssueRequest {
  idempotencyKey: string;
  person: { directoryPersonId: string; firstName: string; lastName: string; documentType?: string | null; documentNumber?: string | null; email?: string | null };
  event: { id: string; name: string; editionId: string; editionName: string; startDate: string; endDate?: string | null };
  role: { id: string; code: string; label: string; templateId?: string | null; hours: number; text?: string | null };
  version: number;
}

export interface CertificateIssueResponse { id: string; code: string; status: string; verifyUrl?: string }

/**
 * Sistema de Certificados del IIAP (flujo 05). Variables: CERTIFICATES_API_URL
 * y CERTIFICATES_API_KEY (X-API-Key con permiso de emisión).
 *
 * Contrato PROPUESTO: POST {url}/api/v1/certificates/issue con cabecera
 * Idempotency-Key. La API actual de Certificados aún no ofrece emisión por API
 * key; sin estas variables, Eventos emite y verifica los certificados localmente.
 */
@Injectable()
export class CertificatesClient {
  get configured() {
    return !!(process.env.CERTIFICATES_API_URL && process.env.CERTIFICATES_API_KEY);
  }

  issue(request: CertificateIssueRequest) {
    const base = process.env.CERTIFICATES_API_URL!.replace(/\/+$/, '');
    return requestJson<CertificateIssueResponse>(`${base}/api/v1/certificates/issue`, {
      provider: 'Certificados',
      method: 'POST',
      body: request,
      headers: { 'X-API-Key': process.env.CERTIFICATES_API_KEY!, 'Idempotency-Key': request.idempotencyKey },
      timeoutMs: 60_000,
    });
  }
}
