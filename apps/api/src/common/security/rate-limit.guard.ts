import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export interface RateLimitOptions { bucket: string; max: number; windowMs: number }

const RATE_LIMIT = 'rateLimit';

/** Limita intentos por IP y ruta. Frena fuerza bruta sobre contraseñas y códigos de 6 dígitos. */
export const RateLimit = (bucket: string, max: number, windowMs: number) => SetMetadata(RATE_LIMIT, { bucket, max, windowMs } satisfies RateLimitOptions);

/**
 * Contador en memoria del proceso. Con varias instancias detrás de un balanceador
 * el límite efectivo se multiplica; los códigos tienen además su propio tope de
 * intentos en la base, que no depende de la instancia.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT, [context.getHandler(), context.getClass()]);
    if (!options) return true;
    const request = context.switchToHttp().getRequest();
    const ip = String(request.ip || request.headers?.['x-forwarded-for'] || 'unknown');
    const key = `${options.bucket}:${ip}`;
    const now = Date.now();
    if (this.hits.size > 50_000) for (const [entry, value] of this.hits) if (value.resetAt <= now) this.hits.delete(entry);
    const current = this.hits.get(key);
    if (!current || current.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }
    current.count++;
    if (current.count > options.max) {
      const wait = Math.ceil((current.resetAt - now) / 1000);
      throw new HttpException({ message: `Demasiados intentos. Espera ${wait} segundos.`, code: 'RATE_LIMITED' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
