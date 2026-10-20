import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Actor, EventAccessService } from '../../common/event-access.service.js';
import { DirectoryService, PersonInput } from '../directory/directory.service.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { RegistrationsService } from '../registrations/registrations.service.js';

const participantInclude = { profile: true, edition: true, role: true, roleAssignments: { include: { role: true } }, attendanceRecords: true } as const;

@Injectable()
export class ParticipantsService {
  constructor(private readonly prisma: PrismaService, private readonly directory: DirectoryService, private readonly access: EventAccessService, private readonly attendance: AttendanceService, private readonly registrations: RegistrationsService) {}

  async list(editionId: string, actor: Actor) {
    await this.access.assertFor({ editionId }, actor, 'READ');
    const participants = await this.prisma.eventParticipant.findMany({ where: { editionId }, include: { ...participantInclude, profile: { include: { authUser: { select: { email: true } } } }, certificates: true }, orderBy: { registeredAt: 'desc' } });
    return participants.map(({ profile, ...participant }) => {
      const extraEmails = Array.isArray(profile.additionalEmails) ? profile.additionalEmails : [];
      const email = profile.primaryEmail || profile.authUser?.email || extraEmails.find((value: unknown) => typeof value === 'string' && value.trim()) || null;
      const { authUser, ...profileDetails } = profile;
      return { ...participant, profile: { ...profileDetails, email } };
    });
  }

  async add(editionId: string, profileId: string, roleId: string | undefined, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const edition = await tx.edition.findUnique({ where: { id: editionId } });
      if (!edition) throw new NotFoundException('Edición no encontrada');
      await this.access.assertManager(edition.mainEventId, actor, tx);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-operations:${edition.mainEventId}`}, 0))::text`;
      if (roleId && !await tx.participantRole.findFirst({ where: { id: roleId, mainEventId: edition.mainEventId, isActive: true, OR: [{ editionId: null }, { editionId }] } })) throw new BadRequestException('El rol no está activo o no pertenece a esta edición');
      if (await tx.eventParticipant.findUnique({ where: { editionId_profileId: { editionId, profileId } } })) throw new ConflictException('El perfil ya está registrado');
      return tx.eventParticipant.create({ data: { editionId, profileId, roleId, origin: 'MANUAL', confirmedAt: new Date(), roleAssignments: roleId ? { create: { roleId } } : undefined }, include: participantInclude });
    }).then(async (participant) => { await this.registrations.afterCommit(participant.id); return participant; });
  }

  async addManual(eventId: string, data: PersonInput & { editionId?: string; roleId?: string }, actor: Actor) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.access.assertManager(eventId, actor, tx);
      // Alta del organizador: un conflicto del Directorio se muestra para decidir, no se abre revisión.
      return this.registrations.register(tx, { eventId, editionId: data.editionId, person: data, origin: 'MANUAL', roleId: data.roleId });
    }, { timeout: 20_000 });
    await this.registrations.afterCommit(result.participant.id);
    return this.prisma.eventParticipant.findUniqueOrThrow({ where: { id: result.participant.id }, include: participantInclude });
  }

  async get(id: string, actor: Actor) {
    await this.access.assertFor({ participantId: id }, actor, 'READ');
    return this.find(id);
  }

  private async find(id: string) {
    const item = await this.prisma.eventParticipant.findUnique({ where: { id }, include: { ...participantInclude, certificates: true } });
    if (!item) throw new NotFoundException('Participante no encontrado');
    return item;
  }

  async update(id: string, data: { checkedIn?: boolean }, actor: Actor) {
    const participant = await this.find(id);
    if (typeof data.checkedIn !== 'boolean') throw new BadRequestException('Indica el estado de asistencia');
    await this.attendance.approveBulk(participant.edition.mainEventId, { participantIds: [id], valid: data.checkedIn }, actor);
    return this.find(id);
  }

  changeRole(id: string, roleId: string, actor: Actor) { return this.setRoles(id, [roleId], actor); }

  async setRoles(id: string, roleIds: string[], actor: Actor) {
    if (!roleIds.length || roleIds.length > 20) throw new BadRequestException('Selecciona entre 1 y 20 roles');
    const ids = [...new Set(roleIds)];
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.eventParticipant.findUnique({ where: { id }, include: { edition: true } });
      if (!participant) throw new NotFoundException('Participante no encontrado');
      await this.access.assertManager(participant.edition.mainEventId, actor, tx);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-operations:${participant.edition.mainEventId}`}, 0))::text`;
      const roles = await tx.participantRole.findMany({ where: { id: { in: ids }, mainEventId: participant.edition.mainEventId, isActive: true, OR: [{ editionId: null }, { editionId: participant.editionId }] } });
      if (roles.length !== ids.length) throw new BadRequestException('Los roles deben estar activos y pertenecer a esta edición');
      if (await tx.participantCertificate.count({ where: { participantId: id, status: 'ISSUED' } })) throw new ConflictException('Revoca los certificados emitidos antes de cambiar los roles');
      await tx.participantRoleAssignment.deleteMany({ where: { participantId: id, roleId: { notIn: ids } } });
      await tx.participantRoleAssignment.createMany({ data: ids.map((roleId) => ({ participantId: id, roleId })), skipDuplicates: true });
      return tx.eventParticipant.update({ where: { id }, data: { roleId: ids[0] }, include: participantInclude });
    });
  }

  async remove(id: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.eventParticipant.findUnique({ where: { id }, include: { edition: true } });
      if (!participant) throw new NotFoundException('Participante no encontrado');
      await this.access.assertManager(participant.edition.mainEventId, actor, tx);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-operations:${participant.edition.mainEventId}`}, 0))::text`;
      if (await tx.attendanceRecord.count({ where: { participantId: id } }) || await tx.participantCertificate.count({ where: { participantId: id } })) throw new ConflictException('No se puede eliminar una inscripción con historial de asistencia o certificados');
      return tx.eventParticipant.delete({ where: { id } });
    });
  }
}
