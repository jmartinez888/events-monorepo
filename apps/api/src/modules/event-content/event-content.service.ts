import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventMode, Prisma, SessionSpeakerRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { DirectoryService, PersonInput } from '../directory/directory.service.js';
import { Actor, EventAccessService } from '../../common/event-access.service.js';
import { IntegrationJobsService } from '../integrations/integration-jobs.service.js';
import { parsePeruDateTime } from '../../common/peru-time.js';

const isSpeakerRole = (name?: string | null) => {
  const normalized = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return ['speaker', 'speakers', 'speaker_mg', 'ponente', 'ponentes'].includes(normalized);
};

export interface SessionInput { title?: string; description?: string | null; startsAt?: string | null; endsAt?: string | null; modality?: EventMode | null }

const speakerInclude = { profile: true } as const;
const sessionInclude = { speakers: { include: speakerInclude }, integration: { select: { zoomStatus: true, zoomJoinUrl: true, facebookStatus: true, facebookLiveUrl: true, attendanceStatus: true } } } satisfies Prisma.EventSessionInclude;

/** Agenda, sesiones, ponentes y catálogos del evento. Cada operación comprueba permisos sobre el evento dueño. */
@Injectable()
export class EventContentService {
  constructor(private readonly prisma: PrismaService, private readonly directory: DirectoryService, private readonly access: EventAccessService, private readonly jobs: IntegrationJobsService) {}

  async activities(editionId: string, actor: Actor) {
    await this.access.assertFor({ editionId }, actor, 'READ');
    return this.prisma.eventActivity.findMany({ where: { editionId }, include: { sessions: { include: sessionInclude, orderBy: [{ startsAt: 'asc' }, { title: 'asc' }] } }, orderBy: { startsAt: 'asc' } });
  }
  async createActivity(editionId: string, data: { title: string; description?: string; startsAt?: string; endsAt?: string }, actor: Actor) {
    await this.access.assertFor({ editionId }, actor, 'EDIT');
    return this.prisma.eventActivity.create({ data: { editionId, title: data.title, description: data.description, startsAt: this.date(data.startsAt) ?? undefined, endsAt: this.date(data.endsAt) ?? undefined } });
  }
  async updateActivity(id: string, data: { title?: string; description?: string | null; startsAt?: string | null; endsAt?: string | null }, actor: Actor) {
    await this.access.assertFor({ activityId: id }, actor, 'EDIT');
    return this.prisma.eventActivity.update({ where: { id }, data: { title: data.title, description: data.description, startsAt: this.date(data.startsAt), endsAt: this.date(data.endsAt) } });
  }
  async deleteActivity(id: string, actor: Actor) {
    await this.access.assertFor({ activityId: id }, actor, 'EDIT');
    await this.assertSessionsRemovable({ activityId: id });
    return this.prisma.eventActivity.delete({ where: { id } });
  }

  async sessions(activityId: string, actor: Actor) {
    await this.access.assertFor({ activityId }, actor, 'READ');
    return this.prisma.eventSession.findMany({ where: { activityId }, include: sessionInclude, orderBy: [{ startsAt: 'asc' }, { title: 'asc' }] });
  }
  async createSession(activityId: string, data: SessionInput, actor: Actor) {
    await this.access.assertFor({ activityId }, actor, 'EDIT');
    const session = await this.prisma.eventSession.create({ data: { activityId, ...this.sessionData(data, true) } });
    await this.sessionChanged(session.id);
    return session;
  }
  async createSessionForEdition(editionId: string, data: SessionInput, actor: Actor) {
    await this.access.assertFor({ editionId }, actor, 'EDIT');
    let activity = await this.prisma.eventActivity.findFirst({ where: { editionId }, orderBy: { startsAt: 'asc' } });
    if (!activity) activity = await this.prisma.eventActivity.create({ data: { editionId, title: 'Agenda principal' } });
    const session = await this.prisma.eventSession.create({ data: { activityId: activity.id, ...this.sessionData(data, true) } });
    await this.sessionChanged(session.id);
    return session;
  }
  async sessionsForParticipant(participantId: string, actor: Actor) {
    await this.access.assertFor({ participantId }, actor, 'READ');
    const participant = await this.prisma.eventParticipant.findUnique({ where: { id: participantId }, select: { profileId: true, edition: { select: { mainEventId: true } } } });
    if (!participant) throw new NotFoundException('Ponente no encontrado');
    return this.prisma.eventSession.findMany({ where: { speakers: { some: { profileId: participant.profileId } }, activity: { edition: { mainEventId: participant.edition.mainEventId } } }, include: sessionInclude });
  }
  /** Solo campos editables: título, descripción, horario y modalidad. Un cambio de horario se propaga a Zoom, Asistencia y recordatorios. */
  async updateSession(id: string, data: SessionInput, actor: Actor) {
    await this.access.assertFor({ sessionId: id }, actor, 'EDIT');
    const current = await this.prisma.eventSession.findUniqueOrThrow({ where: { id } });
    const next = this.sessionData(data, false);
    const startsAt = next.startsAt === undefined ? current.startsAt : next.startsAt;
    const endsAt = next.endsAt === undefined ? current.endsAt : next.endsAt;
    if (startsAt && endsAt && endsAt <= startsAt) throw new BadRequestException('La hora de fin debe ser posterior al inicio');
    const session = await this.prisma.eventSession.update({ where: { id }, data: next, include: sessionInclude });
    await this.sessionChanged(id);
    return session;
  }
  async deleteSession(id: string, actor: Actor) {
    await this.access.assertFor({ sessionId: id }, actor, 'EDIT');
    await this.assertSessionsRemovable({ sessionId: id });
    return this.prisma.eventSession.delete({ where: { id } });
  }

  async addSpeaker(sessionId: string, data: { profileId: string; role?: SessionSpeakerRole; topic?: string }, actor: Actor) {
    await this.access.assertFor({ sessionId }, actor, 'EDIT');
    return this.prisma.sessionSpeaker.create({ data: { sessionId, profileId: data.profileId, role: data.role ?? 'SPEAKER', topic: data.topic?.trim() || null }, include: speakerInclude });
  }
  async updateSessionSpeaker(id: string, data: { role?: SessionSpeakerRole; topic?: string | null }, actor: Actor) {
    const speaker = await this.prisma.sessionSpeaker.findUnique({ where: { id }, select: { sessionId: true } });
    if (!speaker) throw new NotFoundException('Expositor no encontrado');
    await this.access.assertFor({ sessionId: speaker.sessionId }, actor, 'EDIT');
    return this.prisma.sessionSpeaker.update({ where: { id }, data: { role: data.role, topic: data.topic === undefined ? undefined : data.topic?.trim() || null }, include: speakerInclude });
  }
  async removeSpeaker(id: string, actor: Actor) {
    const speaker = await this.prisma.sessionSpeaker.findUnique({ where: { id }, select: { sessionId: true } });
    if (!speaker) throw new NotFoundException('Expositor no encontrado');
    await this.access.assertFor({ sessionId: speaker.sessionId }, actor, 'EDIT');
    if (await this.prisma.eventFile.count({ where: { sessionSpeakerId: id, status: { not: 'DELETED' } } })) throw new ConflictException('El expositor tiene materiales; elimínalos o reasígnalos antes');
    return this.prisma.sessionSpeaker.delete({ where: { id } });
  }

  async tickets(editionId: string, actor: Actor) { await this.access.assertFor({ editionId }, actor, 'READ'); return this.prisma.eventTicket.findMany({ where: { editionId }, orderBy: { name: 'asc' } }); }
  async createTicket(editionId: string, data: { name: string; price: number; capacity?: number }, actor: Actor) { await this.access.assertFor({ editionId }, actor, 'EDIT'); return this.prisma.eventTicket.create({ data: { editionId, name: data.name, price: data.price, capacity: data.capacity } }); }
  async updateTicket(id: string, data: { name?: string; price?: number; capacity?: number | null }, actor: Actor) {
    const ticket = await this.prisma.eventTicket.findUnique({ where: { id }, select: { editionId: true } });
    if (!ticket) throw new NotFoundException('Entrada no encontrada');
    await this.access.assertFor({ editionId: ticket.editionId }, actor, 'EDIT');
    return this.prisma.eventTicket.update({ where: { id }, data: { name: data.name, price: data.price, capacity: data.capacity } });
  }
  async deleteTicket(id: string, actor: Actor) {
    const ticket = await this.prisma.eventTicket.findUnique({ where: { id }, select: { editionId: true } });
    if (!ticket) throw new NotFoundException('Entrada no encontrada');
    await this.access.assertFor({ editionId: ticket.editionId }, actor, 'EDIT');
    return this.prisma.eventTicket.delete({ where: { id } });
  }

  async thematicLines(eventId: string, actor: Actor) { await this.access.assertEvent(eventId, actor, 'READ'); return this.prisma.thematicLine.findMany({ where: { mainEventId: eventId }, orderBy: { name: 'asc' } }); }
  async createThematicLine(eventId: string, name: string, description: string | undefined, actor: Actor) { await this.access.assertEvent(eventId, actor, 'EDIT'); return this.prisma.thematicLine.create({ data: { mainEventId: eventId, name, description } }); }
  async updateThematicLine(id: string, data: { name?: string; description?: string | null }, actor: Actor) {
    const line = await this.prisma.thematicLine.findUnique({ where: { id }, select: { mainEventId: true } });
    if (!line) throw new NotFoundException('Línea temática no encontrada');
    await this.access.assertEvent(line.mainEventId, actor, 'EDIT');
    return this.prisma.thematicLine.update({ where: { id }, data: { name: data.name, description: data.description } });
  }
  async deleteThematicLine(id: string, actor: Actor) {
    const line = await this.prisma.thematicLine.findUnique({ where: { id }, select: { mainEventId: true } });
    if (!line) throw new NotFoundException('Línea temática no encontrada');
    await this.access.assertEvent(line.mainEventId, actor, 'EDIT');
    return this.prisma.thematicLine.delete({ where: { id } });
  }

  async roles(mainEventId: string | undefined, editionId: string | undefined, actor: Actor) {
    if (!mainEventId && !editionId) throw new BadRequestException('Indica el evento o la edición');
    if (mainEventId) await this.access.assertEvent(mainEventId, actor, 'READ');
    else await this.access.assertFor({ editionId }, actor, 'READ');
    return this.prisma.participantRole.findMany({ where: { mainEventId: mainEventId || undefined, editionId: editionId || undefined }, orderBy: { createdAt: 'desc' } });
  }

  async speakers(eventId: string, editionId: string | undefined, actor: Actor) {
    await this.access.assertEvent(eventId, actor, 'READ');
    const editions = editionId ? [editionId] : (await this.prisma.edition.findMany({ where: { mainEventId: eventId }, select: { id: true } })).map((e: { id: string }) => e.id);
    const participants = await this.prisma.eventParticipant.findMany({ where: { editionId: { in: editions }, edition: { mainEventId: eventId } }, include: { profile: true, edition: true, role: true, roleAssignments: { include: { role: true } } }, orderBy: { registeredAt: 'desc' } });
    return participants.filter((participant) => participant.roleAssignments.some((assignment) => assignment.role.isSpeaker) || participant.role?.isSpeaker || isSpeakerRole(participant.role?.name));
  }

  async createSpeaker(data: PersonInput & { eventId: string; editionId: string; profileId?: string | null; roleId?: string | null }, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const event = await this.access.assertEvent(data.eventId, actor, 'EDIT', tx);
      await this.access.lockEvent(tx, data.eventId);
      const edition = await tx.edition.findFirst({ where: { id: data.editionId, mainEventId: data.eventId } });
      if (!edition) throw new BadRequestException('La edición seleccionada no pertenece a este evento');
      if (!data.roleId) throw new BadRequestException('Debes seleccionar un rol para registrar al ponente');
      const role = await tx.participantRole.findFirst({ where: { id: data.roleId, mainEventId: data.eventId, isActive: true, OR: [{ editionId: null }, { editionId: data.editionId }] } });
      if (!role) throw new BadRequestException('El rol seleccionado no pertenece a este evento');
      if (!role.isSpeaker && !isSpeakerRole(role.name)) throw new BadRequestException('El rol seleccionado debe estar habilitado como expositor');
      const profile = data.profileId ? await tx.profile.findUnique({ where: { id: data.profileId } }) : await this.directory.resolve(tx, { ...data, organizationId: event.organizationId });
      if (!profile) throw new NotFoundException('El perfil seleccionado no existe');
      const participant = await tx.eventParticipant.upsert({ where: { editionId_profileId: { editionId: data.editionId, profileId: profile.id } }, create: { editionId: data.editionId, profileId: profile.id, roleId: data.roleId, origin: 'SPEAKER', confirmedAt: new Date() }, update: {} });
      await tx.participantRoleAssignment.upsert({ where: { participantId_roleId: { participantId: participant.id, roleId: data.roleId } }, create: { participantId: participant.id, roleId: data.roleId }, update: {} });
      return tx.eventParticipant.findUniqueOrThrow({ where: { id: participant.id }, include: { profile: true, edition: true, role: true } });
    });
  }

  async updateSpeaker(id: string, data: { firstName?: string; lastName?: string; bio?: string }, actor: Actor) {
    let participant = await this.prisma.eventParticipant.findUnique({ where: { id } });
    if (!participant) participant = await this.prisma.eventParticipant.findFirst({ where: { profileId: id } });
    if (!participant) throw new NotFoundException('Ponente no encontrado');
    await this.access.assertFor({ participantId: participant.id }, actor, 'EDIT');
    const profileData = Object.fromEntries(Object.entries({ firstName: data.firstName, lastName: data.lastName, bio: data.bio }).filter(([, v]) => v !== undefined));
    if (Object.keys(profileData).length) await this.prisma.profile.update({ where: { id: participant.profileId }, data: profileData });
    return this.prisma.eventParticipant.findUnique({ where: { id: participant.id }, include: { profile: true, edition: true, role: true } });
  }

  async deleteSpeaker(id: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.eventParticipant.findUnique({ where: { id }, include: { edition: true } });
      if (!participant) throw new NotFoundException('Ponente no encontrado');
      await this.access.assertManager(participant.edition.mainEventId, actor, tx);
      await this.access.lockEvent(tx, participant.edition.mainEventId);
      if (await tx.attendanceRecord.count({ where: { participantId: id } }) || await tx.participantCertificate.count({ where: { participantId: id } })) throw new ConflictException('No se puede eliminar una inscripción con historial de asistencia o certificados');
      const topics = await tx.sessionSpeaker.count({ where: { profileId: participant.profileId, session: { activity: { edition: { mainEventId: participant.edition.mainEventId } } } } });
      if (topics) throw new ConflictException('No se puede eliminar este ponente porque tiene temas o sesiones asignados.');
      return tx.eventParticipant.delete({ where: { id } });
    });
  }

  async resources(sessionId: string, actor: Actor) { await this.access.assertFor({ sessionId }, actor, 'READ'); return this.prisma.sessionResource.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } }); }
  async addResource(sessionId: string, data: { name: string; url: string; type?: string }, actor: Actor) {
    await this.access.assertFor({ sessionId }, actor, 'EDIT');
    return this.prisma.sessionResource.create({ data: { sessionId, name: data.name, url: this.safeUrl(data.url), type: data.type } });
  }
  async updateResource(id: string, data: { name?: string; url?: string; type?: string }, actor: Actor) {
    const resource = await this.prisma.sessionResource.findUnique({ where: { id }, select: { sessionId: true } });
    if (!resource) throw new NotFoundException('Recurso no encontrado');
    await this.access.assertFor({ sessionId: resource.sessionId }, actor, 'EDIT');
    return this.prisma.sessionResource.update({ where: { id }, data: { name: data.name, url: data.url === undefined ? undefined : this.safeUrl(data.url), type: data.type } });
  }
  async removeResource(id: string, actor: Actor) {
    const resource = await this.prisma.sessionResource.findUnique({ where: { id }, select: { sessionId: true } });
    if (!resource) throw new NotFoundException('Recurso no encontrado');
    await this.access.assertFor({ sessionId: resource.sessionId }, actor, 'EDIT');
    return this.prisma.sessionResource.delete({ where: { id } });
  }

  async sessionLines(sessionId: string, actor: Actor) { await this.access.assertFor({ sessionId }, actor, 'READ'); return this.prisma.sessionThematicLine.findMany({ where: { sessionId }, include: { thematicLine: true } }); }
  async addSessionLine(sessionId: string, thematicLineId: string, actor: Actor) { await this.access.assertFor({ sessionId }, actor, 'EDIT'); return this.prisma.sessionThematicLine.create({ data: { sessionId, thematicLineId } }); }
  async removeSessionLine(sessionId: string, thematicLineId: string, actor: Actor) { await this.access.assertFor({ sessionId }, actor, 'EDIT'); return this.prisma.sessionThematicLine.delete({ where: { sessionId_thematicLineId: { sessionId, thematicLineId } } }); }

  private sessionData(data: SessionInput, creating: boolean) {
    const startsAt = this.date(data.startsAt);
    const endsAt = this.date(data.endsAt);
    if (creating && startsAt && endsAt && endsAt <= startsAt) throw new BadRequestException('La hora de fin debe ser posterior al inicio');
    if (data.modality !== undefined && data.modality !== null && !['PHYSICAL', 'ONLINE', 'HYBRID'].includes(data.modality)) throw new BadRequestException('Modalidad inválida');
    return { title: data.title?.trim() || undefined, description: data.description, startsAt, endsAt, modality: data.modality } as { title: string; description?: string | null; startsAt?: Date | null; endsAt?: Date | null; modality?: EventMode | null };
  }

  /** Fechas del panel en hora de Perú; null borra el valor y undefined lo conserva. */
  private date(value: string | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = parsePeruDateTime(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Fecha inválida');
    return parsed;
  }

  private safeUrl(url: string) {
    if (!/^https?:\/\//i.test(url.trim())) throw new BadRequestException('El enlace debe empezar con http:// o https://');
    return url.trim();
  }

  /** La asistencia registrada por sesión es historial: no se borra con la sesión. */
  private async assertSessionsRemovable(ref: { sessionId?: string; activityId?: string }) {
    const where = ref.sessionId ? { sessionId: ref.sessionId } : { session: { activityId: ref.activityId } };
    if (await this.prisma.attendanceRecord.count({ where })) throw new ConflictException('La sesión tiene asistencia registrada; no se puede eliminar');
  }

  private sessionChanged(sessionId: string) {
    return this.jobs.enqueue('SESSION_CHANGED', { sessionId }, { dedupeKey: `session-changed:${sessionId}` });
  }
}
