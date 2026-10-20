import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';

export interface Actor { accountId?: string; role?: string; email?: string }

type Db = Prisma.TransactionClient | PrismaClient;

/** MANAGE: configuración sensible (roles, asistencia, certificados, integraciones). EDIT: contenido. READ: consulta. */
export type AccessLevel = 'MANAGE' | 'EDIT' | 'READ';

const LEVEL_ROLES: Record<AccessLevel, MemberRole[]> = {
  MANAGE: ['OWNER', 'ADMIN'],
  EDIT: ['OWNER', 'ADMIN', 'EDITOR'],
  READ: ['OWNER', 'ADMIN', 'EDITOR', 'MEMBER'],
};

const MESSAGES: Record<AccessLevel, string> = {
  MANAGE: 'Solo un administrador de esta organización puede realizar esta acción',
  EDIT: 'Necesitas permisos de edición en esta organización',
  READ: 'No tienes acceso a este evento',
};

@Injectable()
export class EventAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Permisos según la base de datos, nunca según lo que afirme el token. */
  async assertManager(eventId: string, actor: Actor, db: Db = this.prisma) {
    return this.assertEvent(eventId, actor, 'MANAGE', db);
  }

  async assertEvent(eventId: string, actor: Actor, level: AccessLevel, db: Db = this.prisma) {
    const event = await db.mainEvent.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    await this.assertOrganization(event.organizationId, actor, level, db);
    return event;
  }

  async assertOrganization(organizationId: string | null, actor: Actor, level: AccessLevel, db: Db = this.prisma) {
    if (!actor.accountId) throw new ForbiddenException('Se requiere una cuenta autorizada');
    const account = await db.authUser.findUnique({ where: { id: actor.accountId }, select: { isActive: true, role: true } });
    if (!account?.isActive) throw new ForbiddenException('La cuenta no está activa');
    if (account.role === 'SUPER_ADMIN') return;
    const membership = organizationId ? await db.organizationMember.findFirst({
      where: { organizationId, accountId: actor.accountId, role: { in: LEVEL_ROLES[level] } },
      select: { id: true },
    }) : null;
    if (!membership) throw new ForbiddenException(MESSAGES[level]);
  }

  /** Resuelve el evento dueño de una entidad hija y comprueba el permiso. */
  async assertFor(ref: { editionId?: string; activityId?: string; sessionId?: string; participantId?: string; roleId?: string }, actor: Actor, level: AccessLevel, db: Db = this.prisma) {
    const eventId = await this.eventIdFor(ref, db);
    return this.assertEvent(eventId, actor, level, db);
  }

  async eventIdFor(ref: { editionId?: string; activityId?: string; sessionId?: string; participantId?: string; roleId?: string }, db: Db = this.prisma): Promise<string> {
    let eventId: string | null | undefined;
    if (ref.editionId) eventId = (await db.edition.findUnique({ where: { id: ref.editionId }, select: { mainEventId: true } }))?.mainEventId;
    else if (ref.activityId) eventId = (await db.eventActivity.findUnique({ where: { id: ref.activityId }, select: { edition: { select: { mainEventId: true } } } }))?.edition.mainEventId;
    else if (ref.sessionId) eventId = (await db.eventSession.findUnique({ where: { id: ref.sessionId }, select: { activity: { select: { edition: { select: { mainEventId: true } } } } } }))?.activity.edition.mainEventId;
    else if (ref.participantId) eventId = (await db.eventParticipant.findUnique({ where: { id: ref.participantId }, select: { edition: { select: { mainEventId: true } } } }))?.edition.mainEventId;
    else if (ref.roleId) eventId = (await db.participantRole.findUnique({ where: { id: ref.roleId }, select: { mainEventId: true } }))?.mainEventId;
    if (!eventId) throw new NotFoundException('Recurso no encontrado');
    return eventId;
  }

  /** Serializa operaciones que afectan inscripciones, roles, asistencia y certificados del evento. */
  lockEvent(db: Prisma.TransactionClient, eventId: string) {
    return db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-operations:${eventId}`}, 0))::text`;
  }
}
