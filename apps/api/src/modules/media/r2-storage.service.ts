import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * Almacenamiento de la biblioteca multimedia (portadas, logos, galería). Sus
 * archivos se muestran en el portal, así que el bucket permite lectura anónima
 * de objetos (nunca listado ni escritura).
 *
 * - MinIO/S3 (recomendado en el IIAP): MEDIA_S3_BUCKET con las credenciales y el
 *   endpoint de STORAGE_S3_*. MEDIA_S3_PREFIX (por defecto STORAGE_S3_PREFIX)
 *   separa production/staging. MEDIA_PUBLIC_URL es la base pública del bucket
 *   (por defecto {endpoint}/{bucket}).
 * - Cloudflare R2 (compatibilidad): CLOUDFLARE_R2_* cuando MEDIA_S3_BUCKET no existe.
 *
 * La clave guardada en la base no incluye el prefijo del entorno.
 */
@Injectable()
export class R2StorageService {
  private readonly logger = new Logger('MediaStorage');
  private readonly client?: S3Client;
  private readonly bucket?: string;
  private readonly prefix: string = '';
  private readonly publicBaseUrl: string = '';

  constructor() {
    const env = process.env;
    if (env.MEDIA_S3_BUCKET) {
      const endpoint = normalizeEndpoint(env.MEDIA_S3_ENDPOINT || env.STORAGE_S3_ENDPOINT);
      const accessKeyId = env.MEDIA_S3_ACCESS_KEY_ID || env.STORAGE_S3_ACCESS_KEY_ID;
      const secretAccessKey = env.MEDIA_S3_SECRET_ACCESS_KEY || env.STORAGE_S3_SECRET_ACCESS_KEY;
      this.bucket = env.MEDIA_S3_BUCKET;
      this.prefix = (env.MEDIA_S3_PREFIX ?? env.STORAGE_S3_PREFIX ?? '').replace(/^\/+|\/+$/g, '');
      this.publicBaseUrl = (env.MEDIA_PUBLIC_URL || (endpoint ? `${endpoint}/${this.bucket}` : '')).replace(/\/+$/, '');
      if (endpoint && accessKeyId && secretAccessKey) {
        this.client = new S3Client({ region: env.STORAGE_S3_REGION || 'us-east-1', endpoint, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
        this.logger.log(`Biblioteca multimedia en S3/MinIO: ${this.publicBaseUrl}${this.prefix ? `/${this.prefix}` : ''}`);
      }
      return;
    }
    const accountId = env.CLOUDFLARE_R2_ACCOUNT_ID;
    const accessKeyId = env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    this.bucket = env.CLOUDFLARE_R2_BUCKET_NAME;
    this.publicBaseUrl = (env.CLOUDFLARE_R2_PUBLIC_URL ?? env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
    if (accountId && accessKeyId && secretAccessKey && this.bucket && this.publicBaseUrl) {
      this.client = new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
    }
  }

  private assertConfigured() {
    if (!this.client || !this.bucket || !this.publicBaseUrl) {
      throw new ServiceUnavailableException('El almacenamiento multimedia no está configurado en el servidor.');
    }
  }

  private objectKey(key: string) {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async upload(key: string, file: Express.Multer.File) {
    this.assertConfigured();
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/') && file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Solo se permiten imágenes, videos o documentos PDF.');
    }
    await this.client!.send(new PutObjectCommand({ Bucket: this.bucket!, Key: this.objectKey(key), Body: file.buffer, ContentType: file.mimetype, CacheControl: 'public, max-age=31536000, immutable' }));
    return `${this.publicBaseUrl}/${this.objectKey(key)}`;
  }

  async remove(key: string) {
    this.assertConfigured();
    await this.client!.send(new DeleteObjectCommand({ Bucket: this.bucket!, Key: this.objectKey(key) }));
  }
}

/** Admite el host sin esquema (s3.iiap.gob.pe): se asume HTTPS. */
function normalizeEndpoint(value?: string) {
  if (!value) return undefined;
  return (/^https?:\/\//.test(value) ? value : `https://${value}`).replace(/\/+$/, '');
}
