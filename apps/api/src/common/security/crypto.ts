import crypto from 'node:crypto';
import { config } from '../config.js';

const aesKey = () => crypto.createHash('sha256').update(config.encryptionKey()).digest();

/**
 * Cifra con AES-256-GCM. Formato: v1.<iv>.<tag>.<datos> en base64url. GCM
 * autentica: un valor manipulado en la base falla al descifrar.
 */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Formato de cifrado desconocido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export const sha256 = (input: string | Buffer) => crypto.createHash('sha256').update(input).digest('hex');

/** HMAC con secreto de servidor: un volcado de la base no basta para probar los 10^6 códigos. */
export const hashCode = (code: string) => crypto.createHmac('sha256', config.encryptionKey()).update(code).digest('hex');

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Código numérico uniforme (sin sesgo de módulo). */
export const numericCode = (digits = 6) => String(crypto.randomInt(0, 10 ** digits)).padStart(digits, '0');

/** Código de recuperación XXXXX-XXXXX sin caracteres ambiguos. */
export function recoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 5 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join('');
  return `${part()}-${part()}`;
}

/** Normaliza lo que la persona tecleó a XXXXX-XXXXX; null si no tiene esa forma. */
export function normalizeRecoveryCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length === 10 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : null;
}

/** Firma HMAC-SHA256 en hex de un cuerpo con un secreto compartido. */
export const hmacHex = (secret: string, body: string | Buffer) => crypto.createHmac('sha256', secret).update(body).digest('hex');
