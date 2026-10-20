import crypto from 'node:crypto';

/**
 * TOTP según RFC 6238 (SHA-1, 6 dígitos, periodo de 30 s): el formato de Google
 * Authenticator, Microsoft Authenticator, Authy y 1Password. Misma lógica que
 * usa el sistema de Certificados del IIAP.
 */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30;
const DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Secreto base32 inválido');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secreto de 160 bits, el tamaño recomendado para HMAC-SHA1. */
export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Comprueba un código aceptando ±1 ventana de desfase de reloj. Devuelve el
 * paso que coincidió (para impedir su reutilización) o null.
 */
export function verifyTotp(secretBase32: string, code: string, now = Date.now()): number | null {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const secret = base32Decode(secretBase32);
  const step = Math.floor(now / 1000 / PERIOD);
  for (const drift of [0, -1, 1]) {
    const candidate = hotp(secret, step + drift);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) return step + drift;
  }
  return null;
}

/** URI que codifica el QR para las apps autenticadoras. */
export function otpauthUri(secretBase32: string, accountEmail: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(PERIOD) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
