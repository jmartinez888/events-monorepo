import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { organizationPermissions } from './organization-permissions.js';
import { AuthService } from '../auth/auth.service.js';
import { MailService } from '../mail/mail.service.js';
import { randomBytes } from 'node:crypto';
import { publicAccountSelect } from '../auth/public-account.js';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService, private readonly mail: MailService) {}
  list() { return this.prisma.organization.findMany({ include: { subscription: true, branches: true, _count: { select: { members: true, events: true } } }, orderBy: { createdAt: 'desc' } }); }
  async get(id: string) { const item = await this.prisma.organization.findUnique({ where: { id }, include: { subscription: true, branches: true, members: { include: { profile: true } }, events: true } }); if (!item) throw new NotFoundException('Organización no encontrada'); return item; }
  async create(data: { name: string; slug: string; description?: string }, actor: { accountId: string; role?: string }) {
    const platformAdmin = ['SUPER_ADMIN', 'SAAS_ADMIN'].includes(actor.role ?? '');
    const profile = await this.prisma.profile.findUnique({ where: { authUserId: actor.accountId } });
    if (!profile) throw new BadRequestException('Tu cuenta requiere un perfil antes de crear una institución');
    if (!platformAdmin) {
      const freeInstitutions = await this.prisma.organizationMember.count({ where: { accountId: actor.accountId, role: 'OWNER', organization: { subscription: { is: { plan: 'FREE', status: { in: ['TRIAL', 'ACTIVE'] } } } } } });
      if (freeInstitutions >= 2) throw new BadRequestException('El plan gratuito permite crear como máximo 2 instituciones. Actualiza el plan de una institución para crear otra.');
    }
    return this.prisma.organization.create({ data: { ...data, subscription: { create: { plan: 'FREE', status: 'ACTIVE' } }, members: { create: { profileId: profile.id, accountId: actor.accountId, role: 'OWNER' } } }, include: { subscription: true } });
  }
  update(id: string, data: Record<string, unknown>) { const allowed = ['name', 'slug', 'description', 'organizationType', 'logoUrl', 'coverUrl', 'isActive']; const clean = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key))); return this.prisma.organization.update({ where: { id }, data: clean }); }
  remove(id: string) { return this.prisma.organization.delete({ where: { id } }); }
  branches(organizationId: string) { return this.prisma.organizationBranch.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }); }
  async addBranch(organizationId: string, data: any) { if (data.isMain) await this.prisma.organizationBranch.updateMany({ where: { organizationId }, data: { isMain: false } }); return this.prisma.organizationBranch.create({ data: { ...data, organizationId } }); }
  updateBranch(id: string, data: Record<string, unknown>) { return this.prisma.organizationBranch.update({ where: { id }, data }); }
  removeBranch(id: string) { return this.prisma.organizationBranch.delete({ where: { id } }); }
  async members(organizationId: string) { const members = await this.prisma.organizationMember.findMany({ where: { organizationId }, include: { profile: { include: { authUser: { select: publicAccountSelect } } } }, orderBy: { createdAt: 'desc' } }); return members.map(({ profile, ...member }) => ({ ...member, profile: { ...profile, first_name: profile.firstName, last_name: profile.lastName, avatar_url: profile.avatarUrl, email: profile.authUser?.email ?? null } })); }
  async addMember(organizationId: string, profileId: string, role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'MEMBER' = 'MEMBER') { const profile = await this.prisma.profile.findUnique({ where: { id: profileId } }); if (!profile?.authUserId) throw new BadRequestException('El perfil debe tener una cuenta de acceso para ser miembro de una institución'); return this.prisma.organizationMember.create({ data: { organizationId, profileId, accountId: profile.authUserId, role }, include: { profile: { include: { authUser: { select: publicAccountSelect } } } } }); }
  async inviteMember(organizationId: string, email: string, role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'MEMBER' = 'MEMBER') {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organización no encontrada');
    let account = await this.prisma.authUser.findUnique({ where: { email: email.toLowerCase().trim() }, include: { profile: true } });
    if (!account) {
      const created = await this.auth.createAccount({ email, password: randomBytes(12).toString('base64url') });
      account = await this.prisma.authUser.findUniqueOrThrow({ where: { id: created.id }, include: { profile: true } });
    }
    if (!account.profile) throw new BadRequestException('La cuenta invitada no tiene perfil');
    const membership = await this.prisma.organizationMember.upsert({
      where: { organizationId_accountId: { organizationId, accountId: account.id } },
      update: { role },
      create: { organizationId, accountId: account.id, profileId: account.profile.id, role },
    });
    const fullName = `${account.profile?.firstName ?? ''} ${account.profile?.lastName ?? ''}`.trim() || undefined;
    const delivery = await this.mail.sendInvitation(account.email, {
      recipientName: fullName,
      organizationName: organization.name,
      role,
    });
    return { membership, emailSent: delivery.sent };
  }
  updateMember(id: string, role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'MEMBER') { return this.prisma.organizationMember.update({ where: { id }, data: { role } }); }
  removeMember(id: string) { return this.prisma.organizationMember.delete({ where: { id } }); }
  async access(organizationId: string, accountId: string, isPlatformAdmin = false) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, include: { subscription: true } });
    if (!organization) throw new NotFoundException('Organización no encontrada');
    if (isPlatformAdmin) return { organizationId, role: 'PLATFORM_ADMIN', permissions: ['*'], subscription: organization.subscription };
    const membership = await this.prisma.organizationMember.findFirst({ where: { organizationId, accountId } });
    if (!membership) throw new BadRequestException('La cuenta no pertenece a esta institución');
    return { organizationId, role: membership.role, permissions: organizationPermissions[membership.role], subscription: organization.subscription };
  }
  async assertCanManageMembers(organizationId: string, accountId: string, role?: string) {
    if (['SUPER_ADMIN', 'SAAS_ADMIN'].includes(role ?? '')) return;
    const membership = await this.prisma.organizationMember.findFirst({ where: { organizationId, accountId } });
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) throw new ForbiddenException('No tienes permisos para administrar miembros de esta institución');
  }
  async updateMemberByActor(memberId: string, role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'MEMBER', actor: { accountId: string; role?: string }) {
    const member = await this.prisma.organizationMember.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Miembro no encontrado');
    await this.assertCanManageMembers(member.organizationId, actor.accountId, actor.role);
    return this.updateMember(memberId, role);
  }
  async removeMemberByActor(memberId: string, actor: { accountId: string; role?: string }) {
    const member = await this.prisma.organizationMember.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Miembro no encontrado');
    await this.assertCanManageMembers(member.organizationId, actor.accountId, actor.role);
    if (member.role === 'OWNER') {
      const owners = await this.prisma.organizationMember.count({ where: { organizationId: member.organizationId, role: 'OWNER' } });
      if (owners <= 1) throw new BadRequestException('Una institución debe conservar al menos un propietario');
    }
    return this.removeMember(memberId);
  }
  async updateSubscription(organizationId: string, data: { plan?: 'FREE' | 'PREMIUM' | 'ENTERPRISE'; status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED' }) { await this.get(organizationId); return this.prisma.organizationSubscription.upsert({ where: { organizationId }, update: { plan: data.plan, status: data.status }, create: { organizationId, plan: data.plan ?? 'FREE', status: data.status ?? 'ACTIVE' } }); }
}
