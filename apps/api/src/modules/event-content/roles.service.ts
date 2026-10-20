import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Actor, EventAccessService } from '../../common/event-access.service.js';

export interface RoleInput {
  name?: string;
  mainEventId?: string;
  editionId?: string | null;
  displayName?: string;
  displayNameEn?: string | null;
  badgeColor?: string | null;
  isActive?: boolean;
  isSpeaker?: boolean;
  certificateHours?: number;
  requiresAttendance?: boolean;
  certificateText?: string | null;
  externalTemplateId?: string | null;
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService, private readonly access: EventAccessService) {}

  private clean(input: RoleInput) {
    for (const key of ['isActive', 'isSpeaker', 'requiresAttendance'] as const) {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new BadRequestException(`Valor inválido para ${key}`);
    }
    const { mainEventId, editionId, ...fields } = input;
    const name = input.name?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
    if (name !== undefined && !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(name)) throw new BadRequestException('Código de rol inválido');
    if (input.displayName !== undefined && !input.displayName.trim()) throw new BadRequestException('El nombre del rol es obligatorio');
    if (input.certificateHours !== undefined && (!Number.isInteger(input.certificateHours) || input.certificateHours < 0 || input.certificateHours > 10000)) throw new BadRequestException('Horas de certificado inválidas');
    return { ...fields, name, displayName: input.displayName?.trim(), displayNameEn: input.displayNameEn === undefined ? undefined : input.displayNameEn?.trim() || null };
  }

  async create(input: RoleInput, actor: Actor) {
    if (!input.mainEventId || !input.name) throw new BadRequestException('Evento y código de rol son obligatorios');
    const fields = this.clean(input);
    return this.prisma.$transaction(async (tx) => {
      await this.access.assertManager(input.mainEventId!, actor, tx);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-operations:${input.mainEventId}`}, 0))::text`;
      if (input.editionId && !await tx.edition.findFirst({ where: { id: input.editionId, mainEventId: input.mainEventId } })) throw new BadRequestException('La edición no pertenece al evento');
      if (await tx.participantRole.findFirst({ where: { mainEventId: input.mainEventId, editionId: input.editionId || null, name: { equals: fields.name, mode: 'insensitive' } } })) throw new ConflictException('Ya existe este código de rol en el ámbito seleccionado');
      return tx.participantRole.create({ data: { ...fields, name: fields.name!, mainEventId: input.mainEventId, editionId: input.editionId || null, isSpeaker: input.isSpeaker ?? /^(speaker(?:_mg)?|ponente(?:_mg)?)$/.test(fields.name!) } });
    });
  }

  async update(id: string, input: RoleInput, actor: Actor) {
    const fields = this.clean(input);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.participantRole.findUnique({ where: { id } });
      if (!role?.mainEventId) throw new NotFoundException('Rol del evento no encontrado');
      await this.access.assertManager(role.mainEventId, actor, tx);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-operations:${role.mainEventId}`}, 0))::text`;
      const editionId = input.editionId === undefined ? role.editionId : input.editionId;
      if (editionId && !await tx.edition.findFirst({ where: { id: editionId, mainEventId: role.mainEventId } })) throw new BadRequestException('La edición no pertenece al evento');
      if (editionId && await tx.participantRoleAssignment.count({ where: { roleId: id, participant: { editionId: { not: editionId } } } })) throw new ConflictException('Este rol está asignado en otra edición');
      if (await tx.participantRole.findFirst({ where: { id: { not: id }, mainEventId: role.mainEventId, editionId, name: { equals: fields.name || role.name, mode: 'insensitive' } } })) throw new ConflictException('Ya existe este código de rol en el ámbito seleccionado');
      return tx.participantRole.update({ where: { id }, data: { ...fields, editionId } });
    });
  }

  async remove(id: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.participantRole.findUnique({ where: { id } });
      if (!role?.mainEventId) throw new NotFoundException('Rol del evento no encontrado');
      await this.access.assertManager(role.mainEventId, actor, tx);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-operations:${role.mainEventId}`}, 0))::text`;
      const uses = await tx.participantRoleAssignment.count({ where: { roleId: id } }) + await tx.eventParticipant.count({ where: { roleId: id } });
      if (uses) throw new ConflictException('No se puede eliminar un rol asignado a participantes');
      return tx.participantRole.delete({ where: { id } });
    });
  }
}
