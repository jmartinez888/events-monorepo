import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * Exige una cuenta SUPER_ADMIN activa según la base, no según el token: un rol
 * retirado deja de valer aunque el token de acceso aún no haya expirado.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ user?: { accountId?: string } }>();
    const accountId = request.user?.accountId;
    if (!accountId) throw new UnauthorizedException('Se requiere autenticación de administrador');
    const account = await this.prisma.authUser.findUnique({ where: { id: accountId }, select: { role: true, isActive: true } });
    if (!account?.isActive || account.role !== 'SUPER_ADMIN') throw new ForbiddenException('Se requiere un administrador global');
    return true;
  }
}
