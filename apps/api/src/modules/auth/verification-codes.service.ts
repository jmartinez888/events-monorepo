import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { VerificationPurpose } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { hashCode, numericCode, safeEqualHex } from '../../common/security/crypto.js';

/** Vigencia de un código enviado por correo. */
export const CODE_TTL_MINUTES = 15;
/** Intentos fallidos que admite cada código antes de invalidarse. */
const MAX_ATTEMPTS = 5;
/** Espera mínima entre dos envíos: el servidor de correo no debe servir como arma. */
const RESEND_COOLDOWN_SECONDS = 45;

@Injectable()
export class VerificationCodesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera un código nuevo e invalida los anteriores del mismo propósito: solo
   * sirve el último enviado. Devuelve el código en claro para el correo; en la
   * base queda su HMAC. Con `reuseRecent`, dentro de la espera devuelve null en
   * vez de fallar (el código anterior sigue vigente).
   */
  async issue(accountId: string, purpose: VerificationPurpose, options: { reuseRecent?: boolean } = {}): Promise<string | null> {
    const last = await this.prisma.verificationCode.findFirst({ where: { accountId, purpose }, orderBy: { createdAt: 'desc' } });
    const elapsed = last ? Date.now() - last.createdAt.getTime() : Infinity;
    if (elapsed < RESEND_COOLDOWN_SECONDS * 1000) {
      if (options.reuseRecent && last && !last.consumedAt) return null;
      const wait = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - elapsed) / 1000);
      throw new HttpException({ message: `Espera ${wait} segundos antes de pedir otro código`, code: 'RESEND_COOLDOWN' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = numericCode(6);
    await this.prisma.$transaction([
      this.prisma.verificationCode.updateMany({ where: { accountId, purpose, consumedAt: null }, data: { consumedAt: new Date() } }),
      this.prisma.verificationCode.create({ data: { accountId, purpose, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000) } }),
    ]);
    return code;
  }

  /** Consume un código. Los errores son distinguibles para la interfaz sin revelar nada útil. */
  async consume(accountId: string, purpose: VerificationPurpose, code: string): Promise<void> {
    const record = await this.prisma.verificationCode.findFirst({ where: { accountId, purpose, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!record || record.expiresAt < new Date()) throw new BadRequestException({ message: 'El código expiró. Solicita uno nuevo.', code: 'CODE_EXPIRED' });
    if (record.attempts >= MAX_ATTEMPTS) throw new BadRequestException({ message: 'Demasiados intentos. Solicita un código nuevo.', code: 'CODE_LOCKED' });
    const clean = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean) || !safeEqualHex(hashCode(clean), record.codeHash)) {
      const updated = await this.prisma.verificationCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      const left = MAX_ATTEMPTS - updated.attempts;
      throw new BadRequestException(left > 0
        ? { message: `Código incorrecto. Te quedan ${left} intentos.`, code: 'CODE_INVALID' }
        : { message: 'Demasiados intentos. Solicita un código nuevo.', code: 'CODE_LOCKED' });
    }
    // La condición sobre consumedAt evita que dos peticiones simultáneas usen el mismo código.
    const { count } = await this.prisma.verificationCode.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (!count) throw new BadRequestException({ message: 'El código ya fue utilizado. Solicita uno nuevo.', code: 'CODE_EXPIRED' });
  }
}
