import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { StoragePort } from './storage.port.js';

export interface S3StorageOptions {
  driver: string;
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO necesita rutas tipo /bucket/clave en lugar de subdominios. */
  forcePathStyle?: boolean;
  /** Carpeta dentro del bucket (production, staging…) para compartirlo entre entornos. */
  prefix?: string;
}

/** Cualquier almacenamiento compatible con S3: MinIO, AWS S3 o Cloudflare R2. El bucket debe ser privado. */
export class S3Storage implements StoragePort {
  readonly driver: string;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(options: S3StorageOptions) {
    this.driver = options.driver;
    this.bucket = options.bucket;
    this.prefix = options.prefix ? `${options.prefix.replace(/^\/+|\/+$/g, '')}/` : '';
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.prefix + key, Body: body, ContentType: contentType }));
  }

  async get(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.prefix + key }));
    return { body: result.Body as Readable, contentType: result.ContentType, size: result.ContentLength };
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.prefix + key }));
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.prefix + key }));
      return true;
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
      throw error;
    }
  }
}
