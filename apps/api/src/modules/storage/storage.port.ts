import type { Readable } from 'node:stream';

/**
 * Puerto de almacenamiento de archivos (flujo 09). Materiales y documentos
 * dependen de esta interfaz, nunca de un proveedor: cambiar MinIO por S3 o disco
 * es cambiar STORAGE_DRIVER y sus credenciales.
 */
export interface StoragePort {
  readonly driver: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Readable; contentType?: string; size?: number }>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export const STORAGE = Symbol('STORAGE');
