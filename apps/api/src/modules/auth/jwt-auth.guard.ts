import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE } from '../../common/public.decorator.js';

/** Validates the access token once for every non-public API route. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(private readonly jwt: JwtService, reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Se requiere una sesión válida');
    try {
      const payload = await this.jwt.verifyAsync(header.slice(7), { secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret' });
      request.user = { accountId: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('La sesión expiró o no es válida');
    }
  }
}
