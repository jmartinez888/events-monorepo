import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RegistrationOrigin, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { Actor, EventAccessService } from '../../common/event-access.service.js';
import { DirectoryService, PersonInput } from '../directory/directory.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { IntegrationJobsService } from '../integrations/integration-jobs.service.js';
import { EventFilesService } from '../event-files/event-files.service.js';
import { TelegramClient } from '../integrations/providers/telegram.client.js';

export interface RegisterInput {
  eventId: string;
  editionId?: string | null;
  person: PersonInput;
  origin: RegistrationOrigin;
  roleId?: string | null;
  /** Inscripciones públicas: un posible duplicado no bloquea, abre revisión. */
  reviewConflicts?: boolean;
  /** Crea una edición principal si el evento aún no tiene ninguna (formularios heredados). */
  createEditionIfMissing?: boolean;
}

/** Orígenes decididos por el equipo organizador o por presencia real: no cuentan contra el aforo. */
const CAPACITY_EXEMPT: RegistrationOrigin[] = ['MANUAL', 'SPEAKER', 'ONSITE', 'OPEN_REGISTRATION', 'IMPORT'];
const ACTIVE: RegistrationStatus[] = ['CONFIRMED', 'PREREGISTERED'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Punto único de inscripción (flujo 02). Formularios, altas manuales, ponentes,
 * registro presencial de Asistencia y asistentes abiertos de Zoom pasan por aquí:
 * misma resolución en el Directorio, mismo aforo y misma lista de espera.
 */
@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EventAccessService,
    private readonly directory: DirectoryService,
    private readonly notifications: NotificationsService,
    private readonly jobs: IntegrationJobsService,
    private readonly files: EventFilesService,
    private readonly telegram: TelegramClient,
  ) {}

  /** Debe ejecutarse dentro de la transacción del llamador. Después del commit, llamar a afterCommit. */
  async register(tx: Prisma.TransactionClient, input: RegisterInput) {
    await this.access.lockEvent(tx, input.eventId);
    const event = await tx.mainEvent.findUnique({ where: { id: input.eventId }, select: { id: true, organizationId: true, capacity: true, waitlistEnabled: true } });
    if (!event) throw new NotFoundException('Evento no encontrado');

    let edition = input.editionId
      ? await tx.edition.findFirst({ where: { id: input.editionId, mainEventId: event.id } })
      : await tx.edition.findFirst({ where: { mainEventId: event.id }, orderBy: [{ isCurrent: 'desc' }, { createdAt: 'asc' }] });
    if (input.editionId && !edition) throw new BadRequestException('La edición no pertenece al evento');
    if (!edition && input.createEditionIfMissing) edition = await tx.edition.create({ data: { mainEventId: event.id, name: 'Edición Principal', isCurrent: true } });
    if (!edition) throw new NotFoundException('Crea o activa una edición antes de registrar participantes');

    const role = input.roleId
      ? await tx.participantRole.findFirst({ where: { id: input.roleId, mainEventId: event.id, isActive: true, OR: [{ editionId: null }, { editionId: edition.id }] } })
      : await this.defaultRole(tx, event.id);
    if (!role) throw new BadRequestException('El rol no está activo o no pertenece a esta edición');
    if (!role.isActive) throw new BadRequestException('El rol de participante no está activo');

    const person = { ...input.person, organizationId: input.person.organizationId ?? event.organizationId };
    const resolved = input.reviewConflicts
      ? await this.directory.resolveOrReview(tx, person, `Inscripción (${input.origin}) con datos que coinciden parcialmente con otra persona`)
      : { profile: await this.directory.resolve(tx, person), review: null };
    const profile = resolved.profile;

    const existing = await tx.eventParticipant.findUnique({ where: { editionId_profileId: { editionId: edition.id, profileId: profile.id } } });
    let participant = existing;
    let created = false;
    if (!existing || existing.status === 'CANCELLED') {
      const status = await this.statusFor(tx, edition.id, event, input.origin);
      participant = existing
        ? await tx.eventParticipant.update({ where: { id: existing.id }, data: { status, origin: input.origin, cancelledAt: null, confirmedAt: status === 'CONFIRMED' ? new Date() : null } })
        : await tx.eventParticipant.create({ data: { editionId: edition.id, profileId: profile.id, roleId: role.id, status, origin: input.origin, confirmedAt: status === 'CONFIRMED' ? new Date() : null } });
      created = true;
    }
    await tx.participantRoleAssignment.upsert({ where: { participantId_roleId: { participantId: participant!.id, roleId: role.id } }, create: { participantId: participant!.id, roleId: role.id }, update: {} });
    if (!participant!.roleId) await tx.eventParticipant.update({ where: { id: participant!.id }, data: { roleId: role.id } });
    return { participant: participant!, profile, edition, review: resolved.review, created };
  }

  /** Efectos fuera de la transacción: avisos y enlaces únicos de Zoom. Nunca hace fallar la inscripción. */
  async afterCommit(participantId: string, options: { notify?: boolean; promoted?: boolean } = {}) {
    try {
      if (options.notify !== false) await this.notifications.scheduleForParticipant(participantId, options.promoted ? { type: 'WAITLIST_PROMOTED' } : {});
      await this.enqueueZoomRegistrants(participantId);
    } catch (error) {
      this.logger.error(`No se pudieron programar los efectos de la inscripción ${participantId}`, error as Error);
    }
  }

  async enqueueZoomRegistrants(participantId: string) {
    const participant = await this.prisma.eventParticipant.findUnique({ where: { id: participantId }, include: { edition: { include: { mainEvent: { select: { zoomEnabled: true } }, activities: { include: { sessions: { include: { integration: { select: { zoomMeetingId: true } } } } } } } } } });
    if (!participant || participant.status !== 'CONFIRMED' || !participant.edition.mainEvent.zoomEnabled) return;
    for (const session of participant.edition.activities.flatMap((activity) => activity.sessions)) {
      if (!session.integration?.zoomMeetingId) continue;
      await this.jobs.enqueue('ZOOM_REGISTRANT', { participantId, sessionId: session.id }, { dedupeKey: `zoom-registrant:${participantId}:${session.id}` });
    }
  }

  /** Cancela una inscripción y libera el cupo para la lista de espera. */
  async cancel(participantId: string) {
    const promoted = await this.prisma.$transaction(async (tx) => {
      const participant = await tx.eventParticipant.findUnique({ where: { id: participantId }, include: { edition: true } });
      if (!participant) throw new NotFoundException('Inscripción no encontrada');
      await this.access.lockEvent(tx, participant.edition.mainEventId);
      if (participant.status === 'CANCELLED') return [];
      if (await tx.attendanceRecord.count({ where: { participantId, valid: true } })) throw new ConflictException('La inscripción ya tiene asistencia registrada; no se puede cancelar');
      await tx.eventParticipant.update({ where: { id: participantId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      return this.promoteWaitlistTx(tx, participant.editionId);
    });
    await this.notifications.cancelForParticipant(participantId);
    for (const id of promoted) await this.afterCommit(id, { promoted: true });
    return { cancelled: true, promoted: promoted.length };
  }

  /** Tras ampliar el aforo: confirma a quienes esperan, por orden de llegada. */
  async promoteWaitlist(eventId: string) {
    const editions = await this.prisma.edition.findMany({ where: { mainEventId: eventId }, select: { id: true } });
    const promoted: string[] = [];
    for (const edition of editions) {
      promoted.push(...await this.prisma.$transaction(async (tx) => {
        await this.access.lockEvent(tx, eventId);
        return this.promoteWaitlistTx(tx, edition.id);
      }));
    }
    for (const id of promoted) await this.afterCommit(id, { promoted: true });
    return { promoted: promoted.length };
  }

  async promoteWaitlistAsManager(eventId: string, actor: Actor) {
    await this.access.assertManager(eventId, actor);
    return this.promoteWaitlist(eventId);
  }

  private async promoteWaitlistTx(tx: Prisma.TransactionClient, editionId: string) {
    const edition = await tx.edition.findUniqueOrThrow({ where: { id: editionId }, include: { mainEvent: { select: { capacity: true } } } });
    const waiting = await tx.eventParticipant.findMany({ where: { editionId, status: 'WAITLISTED' }, orderBy: { registeredAt: 'asc' }, select: { id: true } });
    if (!waiting.length) return [];
    const capacity = edition.mainEvent.capacity;
    const free = capacity == null ? waiting.length : Math.max(0, capacity - await this.activeCount(tx, editionId));
    const selected = waiting.slice(0, free).map((item) => item.id);
    if (selected.length) await tx.eventParticipant.updateMany({ where: { id: { in: selected } }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
    return selected;
  }

  // ---------------------------------------------------------------------------
  // Página personal de la inscripción (enlace único, sin login)
  // ---------------------------------------------------------------------------

  async publicView(token: string) {
    const participant = await this.byToken(token);
    const event = participant.edition.mainEvent;
    const preference = await this.notifications.preferenceFor(participant.profileId);
    const confirmed = participant.status === 'CONFIRMED';
    const sessions = await this.prisma.eventSession.findMany({
      where: { activity: { editionId: participant.editionId } },
      orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true, description: true, startsAt: true, endsAt: true, modality: true, integration: { select: { facebookLiveUrl: true } }, speakers: { select: { role: true, profile: { select: { firstName: true, lastName: true } } } } },
    });
    const links = new Map(participant.sessionRegistrations.map((item) => [item.sessionId, item]));
    const certificates = await this.prisma.participantCertificate.findMany({ where: { participantId: participant.id, status: 'ISSUED' }, include: { role: { select: { displayName: true, name: true } } }, orderBy: { issuedAt: 'desc' } });
    const email = participant.profile.primaryEmail || asStrings(participant.profile.additionalEmails)[0] || '';
    return {
      registration: { status: participant.status, origin: participant.origin, registeredAt: participant.registeredAt, confirmedAt: participant.confirmedAt },
      person: { firstName: participant.profile.firstName, lastName: participant.profile.lastName, email: maskEmail(email) },
      event: { id: event.id, name: event.eventName, description: event.description, mode: event.eventMode, startDate: event.startDate, endDate: event.endDate, venueAddress: event.venueAddress, coverUrl: event.coverUrl, organization: event.organization },
      edition: { id: participant.edition.id, name: participant.edition.name, startDate: participant.edition.startDate, endDate: participant.edition.endDate, location: participant.edition.location },
      sessions: sessions.map((session) => ({
        id: session.id, title: session.title, description: session.description, startsAt: session.startsAt, endsAt: session.endsAt, modality: session.modality ?? event.eventMode,
        speakers: session.speakers.map((speaker) => ({ role: speaker.role, name: `${speaker.profile.firstName ?? ''} ${speaker.profile.lastName ?? ''}`.trim() })),
        // El enlace personal de Zoom solo se muestra a inscripciones confirmadas.
        joinUrl: confirmed ? links.get(session.id)?.joinUrl ?? null : null,
        joinStatus: confirmed ? links.get(session.id)?.status ?? null : null,
        liveUrl: session.integration?.facebookLiveUrl ?? null,
      })),
      files: confirmed ? await this.files.visibleFiles(event.id, 'REGISTERED') : await this.files.visibleFiles(event.id, 'PUBLIC'),
      certificates: certificates.map((certificate) => ({ id: certificate.id, code: certificate.code, role: certificate.role?.displayName || certificate.role?.name || null, hours: certificate.hours, version: certificate.version, issuedAt: certificate.issuedAt, verifyUrl: certificate.verifyUrl })),
      preferences: {
        channel: preference.channel,
        remindersEnabled: preference.remindersEnabled,
        telegramLinked: !!preference.telegramChatId,
        telegramLink: this.telegram.deepLink(preference.telegramLinkToken),
      },
    };
  }

  async updatePreferences(token: string, data: { channel?: 'EMAIL' | 'TELEGRAM'; remindersEnabled?: boolean }) {
    const participant = await this.byToken(token);
    await this.notifications.updatePreference(participant.profileId, data);
    return (await this.publicView(token)).preferences;
  }

  async cancelByToken(token: string) {
    const participant = await this.byToken(token);
    return this.cancel(participant.id);
  }

  /** Lista para el panel con estado, origen, enlaces y certificados. */
  async listForEvent(eventId: string, actor: Actor, filters: { status?: string; editionId?: string } = {}) {
    await this.access.assertEvent(eventId, actor, 'READ');
    return this.prisma.eventParticipant.findMany({
      where: { edition: { mainEventId: eventId }, editionId: filters.editionId || undefined, status: (filters.status as RegistrationStatus) || undefined },
      include: { profile: { select: { id: true, firstName: true, lastName: true, primaryEmail: true, identityDocumentType: true, identityDocumentNumber: true } }, edition: { select: { id: true, name: true } }, roleAssignments: { include: { role: true } }, sessionRegistrations: { select: { sessionId: true, status: true, lastError: true } }, certificates: { select: { id: true, roleId: true, status: true, version: true, code: true } } },
      orderBy: { registeredAt: 'asc' },
    });
  }

  async cancelByManager(participantId: string, actor: Actor) {
    await this.access.assertFor({ participantId }, actor, 'MANAGE');
    return this.cancel(participantId);
  }

  async confirmByManager(participantId: string, actor: Actor) {
    const participant = await this.prisma.$transaction(async (tx) => {
      const current = await tx.eventParticipant.findUnique({ where: { id: participantId }, include: { edition: true } });
      if (!current) throw new NotFoundException('Inscripción no encontrada');
      await this.access.assertManager(current.edition.mainEventId, actor, tx);
      await this.access.lockEvent(tx, current.edition.mainEventId);
      if (current.status === 'CONFIRMED') return current;
      // Confirmar manualmente desde la lista de espera es una decisión del organizador: excede el aforo.
      return tx.eventParticipant.update({ where: { id: participantId }, data: { status: 'CONFIRMED', confirmedAt: new Date(), cancelledAt: null } });
    });
    await this.afterCommit(participant.id, { promoted: true });
    return participant;
  }

  private async byToken(token: string) {
    if (!UUID.test(token)) throw new NotFoundException('Inscripción no encontrada');
    const participant = await this.prisma.eventParticipant.findUnique({
      where: { accessToken: token },
      include: { profile: true, sessionRegistrations: true, edition: { include: { mainEvent: { include: { organization: { select: { name: true, slug: true, logoUrl: true } } } } } } },
    });
    if (!participant) throw new NotFoundException('Inscripción no encontrada');
    return participant;
  }

  private async statusFor(tx: Prisma.TransactionClient, editionId: string, event: { capacity: number | null; waitlistEnabled: boolean }, origin: RegistrationOrigin): Promise<RegistrationStatus> {
    if (event.capacity == null || CAPACITY_EXEMPT.includes(origin)) return 'CONFIRMED';
    if (await this.activeCount(tx, editionId) < event.capacity) return 'CONFIRMED';
    if (event.waitlistEnabled) return 'WAITLISTED';
    throw new BadRequestException('El aforo del evento está completo');
  }

  private activeCount(tx: Prisma.TransactionClient, editionId: string) {
    return tx.eventParticipant.count({ where: { editionId, status: { in: ACTIVE } } });
  }

  private async defaultRole(tx: Prisma.TransactionClient, eventId: string) {
    const role = await tx.participantRole.findFirst({ where: { mainEventId: eventId, editionId: null, name: { equals: 'participant', mode: 'insensitive' } } });
    return role ?? tx.participantRole.create({ data: { mainEventId: eventId, name: 'participant', displayName: 'Participante' } });
  }
}

const asStrings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
function maskEmail(email: string) {
  if (!email.includes('@')) return '';
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}
