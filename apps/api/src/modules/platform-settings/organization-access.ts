import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

/** Solo OWNER o ADMIN de la institución (o un SUPER_ADMIN) ven y cambian sus integraciones. */
@Injectable()
export class OrganizationSettingsAccess {
  constructor(private readonly prisma: PrismaService) {}

  async assert(organizationId: string, accountId?: string, adminOnly = true) {
    if (!accountId) throw new ForbiddenException('Se requiere autenticación');
    const [account, membership] = await Promise.all([
      this.prisma.authUser.findUnique({ where: { id: accountId }, select: { role: true, isActive: true } }),
      this.prisma.organizationMember.findFirst({ where: { organizationId, accountId }, select: { role: true } }),
    ]);
    if (!account?.isActive) throw new ForbiddenException('Cuenta inactiva');
    if (account.role === 'SUPER_ADMIN') return;
    if (!membership) throw new ForbiddenException('No perteneces a esta institución');
    if (adminOnly && !['OWNER', 'ADMIN'].includes(membership.role)) throw new ForbiddenException('Solo los administradores de la institución pueden configurar sus integraciones');
  }
}

type OrgRequest = { params?: { organizationId?: string }; user?: { accountId?: string } };

/** Ruta con :organizationId que solo pueden usar OWNER/ADMIN de esa institución. */
@Injectable()
export class OrganizationAdminGuard implements CanActivate {
  constructor(private readonly access: OrganizationSettingsAccess) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<OrgRequest>();
    await this.access.assert(request.params?.organizationId ?? '', request.user?.accountId);
    return true;
  }
}

/** Ruta con :organizationId que puede leer cualquier miembro de esa institución. */
@Injectable()
export class OrganizationMemberGuard implements CanActivate {
  constructor(private readonly access: OrganizationSettingsAccess) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<OrgRequest>();
    await this.access.assert(request.params?.organizationId ?? '', request.user?.accountId, false);
    return true;
  }
}
