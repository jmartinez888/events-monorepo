import { Injectable } from '@nestjs/common';
import { config } from '../../common/config.js';
import { hmacHex, safeEqualText } from '../../common/security/crypto.js';

export interface FileGrant { versionId: string; exp: number }

/**
 * URL de descarga firmada y temporal (flujos 08 y 09). El enlace no revela la
 * clave de almacenamiento y deja de servir al vencer.
 */
@Injectable()
export class FileUrlSigner {
  static readonly DEFAULT_TTL_SECONDS = 10 * 60;

  sign(versionId: string, ttlSeconds = FileUrlSigner.DEFAULT_TTL_SECONDS) {
    const grant: FileGrant = { versionId, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
    const payload = Buffer.from(JSON.stringify(grant)).toString('base64url');
    const token = `${payload}.${hmacHex(config.fileUrlSecret(), payload)}`;
    return { url: `${config.apiPublicUrl()}/files/${token}`, expiresAt: new Date(grant.exp * 1000) };
  }

  verify(token: string): FileGrant | null {
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !safeEqualText(signature, hmacHex(config.fileUrlSecret(), payload))) return null;
    try {
      const grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as FileGrant;
      if (typeof grant.versionId !== 'string' || typeof grant.exp !== 'number' || grant.exp * 1000 < Date.now()) return null;
      return grant;
    } catch {
      return null;
    }
  }
}
