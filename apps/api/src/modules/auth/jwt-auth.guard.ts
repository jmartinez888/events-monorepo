import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE } from '../../common/public.decorator.js';
import { config } from '../../common/config.js';

/** Validates the access token once for every non-public API route. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Se requiere una sesión válida');
    let payload: { sub: string; role?: string; email?: string; type?: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7), { secret: config.jwtAccessSecret() });
    } catch {
      throw new UnauthorizedException('La sesión expiró o no es válida');
    }
    // Los tokens de paso pendiente (verificación/2FA) y de refresco no abren la API.
    if (payload.type) throw new UnauthorizedException('La sesión expiró o no es válida');
    request.user = { accountId: payload.sub, role: payload.role, email: payload.email };
    return true;
  }
}
