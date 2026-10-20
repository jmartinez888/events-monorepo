import { Global, Logger, Module } from '@nestjs/common';
import path from 'node:path';
import { STORAGE, StoragePort } from './storage.port.js';
import { LocalDiskStorage } from './local-disk.storage.js';
import { S3Storage } from './s3.storage.js';
import { FileUrlSigner } from './file-url.signer.js';

/**
 * STORAGE_DRIVER = local | minio | s3 | r2.
 * - local: STORAGE_LOCAL_DIR (por defecto ./storage).
 * - minio/s3: STORAGE_S3_BUCKET, STORAGE_S3_REGION, STORAGE_S3_ENDPOINT, STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY y STORAGE_S3_PREFIX (carpeta del entorno).
 * - r2: credenciales CLOUDFLARE_R2_* ya usadas por la biblioteca multimedia y STORAGE_S3_BUCKET (bucket privado).
 */
export function createStorage(env: NodeJS.ProcessEnv = process.env): StoragePort {
  const driver = (env.STORAGE_DRIVER || 'local').trim().toLowerCase();
  if (driver === 'local') return new LocalDiskStorage(env.STORAGE_LOCAL_DIR || path.join(process.cwd(), 'storage'));
  if (driver === 'r2') {
    return new S3Storage({
      driver,
      bucket: required(env, 'STORAGE_S3_BUCKET'),
      region: 'auto',
      endpoint: `https://${required(env, 'CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      accessKeyId: required(env, 'CLOUDFLARE_R2_ACCESS_KEY_ID'),
      secretAccessKey: required(env, 'CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
    });
  }
  if (driver === 'minio' || driver === 's3') {
    return new S3Storage({
      driver,
      bucket: required(env, 'STORAGE_S3_BUCKET'),
      region: env.STORAGE_S3_REGION || 'us-east-1',
      // Admite el host sin esquema (s3.iiap.gob.pe): se asume HTTPS.
      endpoint: env.STORAGE_S3_ENDPOINT ? (/^https?:\/\//.test(env.STORAGE_S3_ENDPOINT) ? env.STORAGE_S3_ENDPOINT : `https://${env.STORAGE_S3_ENDPOINT}`) : undefined,
      accessKeyId: required(env, 'STORAGE_S3_ACCESS_KEY_ID'),
      secretAccessKey: required(env, 'STORAGE_S3_SECRET_ACCESS_KEY'),
      forcePathStyle: driver === 'minio' || env.STORAGE_S3_FORCE_PATH_STYLE === 'true',
      prefix: env.STORAGE_S3_PREFIX,
    });
  }
  throw new Error(`STORAGE_DRIVER no soportado: ${driver}`);
}

function required(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name} para el almacenamiento`);
  return value;
}

@Global()
@Module({
  providers: [
    { provide: STORAGE, useFactory: () => { const storage = createStorage(); new Logger('Storage').log(`Almacenamiento de archivos: ${storage.driver}`); return storage; } },
    FileUrlSigner,
  ],
  exports: [STORAGE, FileUrlSigner],
})
export class StorageModule {}
