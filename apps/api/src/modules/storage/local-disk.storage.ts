import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StoragePort } from './storage.port.js';

/** Disco local: desarrollo o un volumen montado. La clave nunca puede salir del directorio raíz. */
export class LocalDiskStorage implements StoragePort {
  readonly driver = 'local';
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) throw new Error('Clave de almacenamiento inválida');
    return target;
  }

  async put(key: string, body: Buffer) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async get(key: string) {
    const target = this.resolve(key);
    const info = await stat(target);
    return { body: createReadStream(target), size: info.size };
  }

  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async exists(key: string) {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
