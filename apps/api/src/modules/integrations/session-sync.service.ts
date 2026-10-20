import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { IntegrationJobsService } from './integration-jobs.service.js';
import { PermanentError } from './http.js';
import { ZoomClient, ZoomParticipant } from './providers/zoom.client.js';
import { FacebookClient } from './providers/facebook.client.js';
import { AttendanceAttendee, AttendanceClient } from './providers/attendance.client.js';
import { AttendanceService, mergeIntervals } from '../attendance/attendance.service.js';
import { RegistrationsService } from '../registrations/registrations.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { decryptSecret, encryptSecret } from '../../common/security/crypto.js';

export const JOB = {
  SESSION_CHANGED: 'SESSION_CHANGED',
  ZOOM_SYNC: 'ZOOM_SYNC_SESSION',
  FACEBOOK_SYNC: 'FACEBOOK_SYNC_SESSION',
  ZOOM_REGISTRANT: 'ZOOM_REGISTRANT',
  ZOOM_IMPORT: 'ZOOM_IMPORT_ATTENDANCE',
  ATTENDANCE_MIRROR: 'ATTENDANCE_MIRROR_SYNC',
  ATTENDANCE_RECONCILE: 'ATTENDANCE_RECONCILE',
} as const;

const sessionInclude = { integration: true, activity: { include: { edition: { include: { mainEvent: true } } } } } satisfies Prisma.EventSessionInclude;
type SessionContext = Prisma.EventSessionGetPayload<{ include: typeof sessionInclude }>;

/**
 * Orquesta cada sesión con los sistemas externos (flujos 01, 03 y 04). Eventos
 * es la fuente de verdad: Zoom, Facebook y Asistencia reciben copias. Un fallo de
 * un proveedor marca su estado en ERROR y se reintenta; nunca borra el evento ni
 * la inscripción.
 */
@Injectable()
export class SessionSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionSyncService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: IntegrationJobsService,
    private readonly zoom: ZoomClient,
    private readonly facebook: FacebookClient,
    private readonly attendanceApi: AttendanceClient,
    private readonly attendance: AttendanceService,
    private readonly registrations: RegistrationsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.jobs.register(JOB.SESSION_CHANGED, (payload) => this.onSessionChanged(payload.sessionId));
    this.jobs.register(JOB.ZOOM_SYNC, (payload) => this.syncZoom(payload.sessionId));
    this.jobs.register(JOB.FACEBOOK_SYNC, (payload) => this.syncFacebook(payload.sessionId));
    this.jobs.register(JOB.ZOOM_REGISTRANT, (payload) => this.syncRegistrant(payload.participantId, payload.sessionId));
    this.jobs.register(JOB.ZOOM_IMPORT, (payload) => this.importZoomAttendance(payload.sessionId).then(() => undefined));
    this.jobs.register(JOB.ATTENDANCE_MIRROR, (payload) => this.syncAttendanceMirror(payload.sessionId));
    this.jobs.register(JOB.ATTENDANCE_RECONCILE, (payload) => this.reconcileAttendance(payload.sessionId).then(() => undefined));
    if (process.env.INTEGRATION_WORKER !== 'false') {
      this.timer = setInterval(() => void this.reconcileTick().catch((error) => this.logger.error('Fallo en la reconciliación periódica', error)), Number(process.env.RECONCILE_INTERVAL_MS || 15 * 60_000));
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Encola la sincronización de todas las sesiones del evento (tras cambiar la configuración). */
  async enqueueEvent(eventId: string) {
    const sessions = await this.prisma.eventSession.findMany({ where: { activity: { edition: { mainEventId: eventId } } }, select: { id: true } });
    for (const session of sessions) await this.jobs.enqueue(JOB.SESSION_CHANGED, { sessionId: session.id }, { dedupeKey: `session-changed:${session.id}` });
    await this.notifications.rescheduleEvent(eventId);
    return { sessions: sessions.length };
  }

  private async onSessionChanged(sessionId: string) {
    const session = await this.prisma.eventSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    if (!session) return;
    const event = session.activity.edition.mainEvent;
    // Horario nuevo: recordatorios de la hora anterior se anulan y se programan los nuevos.
    await this.notifications.rescheduleEvent(event.id);
    if (event.zoomEnabled && this.isVirtual(session)) await this.jobs.enqueue(JOB.ZOOM_SYNC, { sessionId }, { dedupeKey: `zoom-sync:${sessionId}` });
    if (event.attendanceMirrorEnabled && this.isPhysical(session)) await this.jobs.enqueue(JOB.ATTENDANCE_MIRROR, { sessionId }, { dedupeKey: `attendance-mirror:${sessionId}` });
  }

  // ---------------------------------------------------------------------------
  // Zoom + Facebook Live (flujo 01)
  // ---------------------------------------------------------------------------

  async syncZoom(sessionId: string) {
    const session = await this.load(sessionId);
    const event = session.activity.edition.mainEvent;
    if (!event.zoomEnabled || !this.isVirtual(session)) return this.setIntegration(sessionId, { zoomStatus: 'DISABLED', zoomError: null });
    const window = this.window(session);
    if (!window) return this.setIntegration(sessionId, { zoomStatus: 'ERROR', zoomError: 'La sesión necesita hora de inicio y fin' });
    if (!this.zoom.configured) return this.setIntegration(sessionId, { zoomStatus: 'ERROR', zoomError: 'Zoom no está configurado en el servidor (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET)' });
    const topic = `${event.eventName} · ${session.title}`;
    const durationMinutes = Math.max(1, Math.round((window.end.getTime() - window.start.getTime()) / 60_000));
    try {
      if (session.integration?.zoomMeetingId) {
        await this.zoom.updateMeeting(session.integration.zoomMeetingId, { topic, startTime: window.start, durationMinutes, agenda: session.description ?? undefined });
        await this.setIntegration(sessionId, { zoomStatus: 'SYNCED', zoomError: null });
      } else {
        const meeting = await this.zoom.createMeeting({ topic, startTime: window.start, durationMinutes, agenda: session.description ?? undefined, registration: true });
        await this.setIntegration(sessionId, { zoomMeetingId: String(meeting.id), zoomJoinUrl: meeting.join_url, zoomStartUrlEnc: meeting.start_url ? encryptSecret(meeting.start_url) : null, zoomRegistrationUrl: meeting.registration_url ?? null, zoomStatus: 'SYNCED', zoomError: null });
        // Inscritos que ya existían reciben ahora su enlace único.
        const participants = await this.prisma.eventParticipant.findMany({ where: { editionId: session.activity.editionId, status: 'CONFIRMED' }, select: { id: true } });
        for (const participant of participants) await this.jobs.enqueue(JOB.ZOOM_REGISTRANT, { participantId: participant.id, sessionId }, { dedupeKey: `zoom-registrant:${participant.id}:${sessionId}` });
      }
    } catch (error: any) {
      await this.setIntegration(sessionId, { zoomStatus: 'ERROR', zoomError: String(error?.message ?? error).slice(0, 1000) });
      throw error;
    }
    if (event.facebookLiveEnabled) await this.jobs.enqueue(JOB.FACEBOOK_SYNC, { sessionId }, { dedupeKey: `facebook-sync:${sessionId}` });
  }

  async syncFacebook(sessionId: string) {
    const session = await this.load(sessionId);
    const event = session.activity.edition.mainEvent;
    if (!event.facebookLiveEnabled) return this.setIntegration(sessionId, { facebookStatus: 'DISABLED', facebookError: null });
    const window = this.window(session);
    const meetingId = session.integration?.zoomMeetingId;
    if (!window || !meetingId) return this.setIntegration(sessionId, { facebookStatus: 'PENDING', facebookError: 'Se configura después de crear la reunión de Zoom' });
    if (!this.facebook.configured) return this.setIntegration(sessionId, { facebookStatus: 'ERROR', facebookError: 'Facebook no está configurado en el servidor (FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN)' });
    const input = { title: `${event.eventName} · ${session.title}`, description: session.description ?? event.description ?? undefined, plannedStart: window.start };
    try {
      if (session.integration?.facebookLiveId) {
        await this.facebook.updateLiveVideo(session.integration.facebookLiveId, input);
        await this.setIntegration(sessionId, { facebookStatus: 'SYNCED', facebookError: null });
        return;
      }
      const live = await this.facebook.createLiveVideo(input);
      await this.setIntegration(sessionId, { facebookLiveId: live.liveId, facebookLiveUrl: live.permalink, rtmpStreamUrl: live.streamUrl, rtmpStreamKeyEnc: encryptSecret(live.streamKey), facebookStatus: 'PENDING', facebookError: 'Live creado; configurando la transmisión en Zoom' });
      await this.zoom.setLivestream(meetingId, { streamUrl: live.streamUrl, streamKey: live.streamKey, pageUrl: live.permalink });
      await this.setIntegration(sessionId, { facebookStatus: 'SYNCED', facebookError: null });
    } catch (error: any) {
      await this.setIntegration(sessionId, { facebookStatus: 'ERROR', facebookError: String(error?.message ?? error).slice(0, 1000) });
      throw error;
    }
  }

  /** Enlace único por inscrito (flujo 02, paso 5). */
  async syncRegistrant(participantId: string, sessionId: string) {
    const participant = await this.prisma.eventParticipant.findUnique({ where: { id: participantId }, include: { profile: { include: { authUser: { select: { email: true } } } } } });
    const integration = await this.prisma.sessionIntegration.findUnique({ where: { sessionId } });
    if (!participant || participant.status !== 'CONFIRMED' || !integration?.zoomMeetingId) return;
    const existing = await this.prisma.sessionRegistration.findUnique({ where: { participantId_sessionId: { participantId, sessionId } } });
    if (existing?.status === 'SYNCED' && existing.joinUrl) return;
    const email = participant.profile.primaryEmail || participant.profile.authUser?.email || asStrings(participant.profile.additionalEmails)[0];
    const base = { participantId, sessionId };
    if (!email) {
      await this.prisma.sessionRegistration.upsert({ where: { participantId_sessionId: base }, create: { ...base, status: 'ERROR', lastError: 'La persona no tiene correo' }, update: { status: 'ERROR', lastError: 'La persona no tiene correo' } });
      throw new PermanentError('La persona no tiene correo para registrarla en Zoom');
    }
    try {
      const registrant = await this.zoom.addRegistrant(integration.zoomMeetingId, { email, firstName: participant.profile.firstName ?? 'Participante', lastName: participant.profile.lastName ?? '' });
      await this.prisma.sessionRegistration.upsert({ where: { participantId_sessionId: base }, create: { ...base, registrantId: registrant.registrant_id, joinUrl: registrant.join_url, status: 'SYNCED', attempts: 1 }, update: { registrantId: registrant.registrant_id, joinUrl: registrant.join_url, status: 'SYNCED', lastError: null, attempts: { increment: 1 } } });
    } catch (error: any) {
      // La inscripción sigue confirmada; el enlace queda pendiente y la cola reintenta (flujo 02 §5).
      await this.prisma.sessionRegistration.upsert({ where: { participantId_sessionId: base }, create: { ...base, status: 'ERROR', lastError: String(error?.message ?? error).slice(0, 1000), attempts: 1 }, update: { status: 'ERROR', lastError: String(error?.message ?? error).slice(0, 1000), attempts: { increment: 1 } } });
      throw error;
    }
  }

  /**
   * Asistencia virtual automática (flujo 04, modo A): suma los minutos de cada
   * persona (uniendo reconexiones) y aplica el umbral del evento.
   */
  async importZoomAttendance(sessionId: string) {
    const session = await this.load(sessionId);
    const event = session.activity.edition.mainEvent;
    if (event.virtualAttendanceMode !== 'AUTOMATIC') throw new PermanentError('El evento usa asistencia virtual manual');
    const meetingId = session.integration?.zoomMeetingId;
    if (!meetingId) throw new PermanentError('La sesión no tiene reunión de Zoom');
    const window = this.window(session);
    if (!window) throw new PermanentError('La sesión necesita hora de inicio y fin para calcular la permanencia');
    const duration = Math.max(1, (window.end.getTime() - window.start.getTime()) / 60_000);
    const rows = await this.zoom.pastParticipants(meetingId);
    return this.applyZoomReport(session, rows, duration);
  }

  /** Separado de la llamada a Zoom para poder probar el cálculo con un reporte dado. */
  async applyZoomReport(session: SessionContext, rows: ZoomParticipant[], durationMinutes: number) {
    const event = session.activity.edition.mainEvent;
    const registrations = await this.prisma.sessionRegistration.findMany({ where: { sessionId: session.id, registrantId: { not: null } }, select: { registrantId: true, participantId: true } });
    const byRegistrant = new Map(registrations.map((item) => [item.registrantId!, item.participantId]));
    const participants = await this.prisma.eventParticipant.findMany({ where: { editionId: session.activity.editionId, status: { not: 'CANCELLED' } }, include: { profile: { include: { authUser: { select: { email: true } } } } } });
    const byEmail = new Map<string, string>();
    for (const participant of participants) for (const email of emailsOf(participant.profile)) byEmail.set(email, participant.id);

    const groups = new Map<string, { intervals: Array<{ joinedAt: Date; leftAt: Date }>; name?: string; email?: string }>();
    const unmatched = new Map<string, { intervals: Array<{ joinedAt: Date; leftAt: Date }>; name?: string; email: string }>();
    for (const row of rows) {
      const interval = { joinedAt: new Date(row.join_time), leftAt: new Date(row.leave_time) };
      const email = row.user_email?.trim().toLowerCase() || undefined;
      const participantId = (row.registrant_id && byRegistrant.get(row.registrant_id)) || (email && byEmail.get(email));
      if (participantId) {
        const group = groups.get(participantId) ?? { intervals: [] };
        group.intervals.push(interval);
        groups.set(participantId, group);
      } else if (email) {
        const group = unmatched.get(email) ?? { intervals: [], name: row.name, email };
        group.intervals.push(interval);
        unmatched.set(email, group);
      }
    }

    // Registro abierto (flujo 02 §4.1): quien entró sin inscribirse se crea por Eventos, único escritor del Directorio.
    let created = 0;
    for (const [email, group] of unmatched) {
      const [firstName, ...rest] = (group.name || email.split('@')[0] || 'Participante').trim().split(/\s+/);
      const result = await this.prisma.$transaction((tx) => this.registrations.register(tx, { eventId: event.id, editionId: session.activity.editionId, origin: 'OPEN_REGISTRATION', reviewConflicts: true, person: { firstName: firstName || 'Participante', lastName: rest.join(' ') || '-', email } }), { timeout: 20_000 });
      groups.set(result.participant.id, { intervals: group.intervals });
      created++;
    }

    let valid = 0;
    let kept = 0;
    for (const [participantId, group] of groups) {
      const { merged, minutes } = mergeIntervals(group.intervals);
      const percentage = Math.min(1, minutes / durationMinutes);
      const isValid = percentage >= event.attendanceThreshold;
      const result = await this.prisma.$transaction((tx) => this.attendance.recordExternal(tx, { participantId, sessionId: session.id, method: 'ZOOM', source: 'zoom_report', valid: isValid, minutes, percentage: Math.round(percentage * 1000) / 1000, externalRef: `zoom:${session.integration?.zoomMeetingId}`, intervals: merged }));
      if (result.record.valid) valid++;
      if (result.keptHumanDecision) kept++;
    }
    await this.setIntegration(session.id, { zoomEndedAt: session.integration?.zoomEndedAt ?? new Date() });
    return { rows: rows.length, people: groups.size, valid, createdFromOpenRegistration: created, keptManualDecisions: kept, threshold: event.attendanceThreshold };
  }

  // ---------------------------------------------------------------------------
  // Asistencia presencial por QR (flujo 03)
  // ---------------------------------------------------------------------------

  async syncAttendanceMirror(sessionId: string) {
    const session = await this.load(sessionId);
    const event = session.activity.edition.mainEvent;
    if (!event.attendanceMirrorEnabled || !this.isPhysical(session)) return this.setIntegration(sessionId, { attendanceStatus: 'DISABLED', attendanceError: null });
    if (!this.attendanceApi.configured) return this.setIntegration(sessionId, { attendanceStatus: 'ERROR', attendanceError: 'Asistencia no está configurada en el servidor (ATTENDANCE_API_URL, ATTENDANCE_API_TOKEN)' });
    const window = this.window(session) ?? { start: session.activity.edition.startDate ?? event.startDate, end: session.activity.edition.endDate ?? event.endDate ?? event.startDate };
    const mirror = { sessionId, title: `${event.eventName} · ${session.title}`, description: session.description ?? event.description ?? undefined, location: session.activity.edition.location ?? event.venueAddress, startDate: window.start, endDate: window.end };
    try {
      if (session.integration?.attendanceEventId) await this.attendanceApi.updateEvent(session.integration.attendanceEventId, mirror);
      else {
        const created = await this.attendanceApi.createEvent(mirror);
        await this.setIntegration(sessionId, { attendanceEventId: String(created.id) });
      }
      await this.setIntegration(sessionId, { attendanceStatus: 'SYNCED', attendanceError: null });
    } catch (error: any) {
      // Un fallo del espejo no bloquea el evento en Eventos (flujo 03 §7).
      await this.setIntegration(sessionId, { attendanceStatus: 'ERROR', attendanceError: String(error?.message ?? error).slice(0, 1000) });
      throw error;
    }
  }

  /** Reconciliación al cierre: recupera marcas cuyo webhook se perdió. Repetirla no duplica. */
  async reconcileAttendance(sessionId: string) {
    const session = await this.load(sessionId);
    const externalId = session.integration?.attendanceEventId;
    if (!externalId) throw new PermanentError('La sesión no tiene evento espejo en Asistencia');
    const mirror = await this.attendanceApi.getEvent(externalId);
    let recorded = 0;
    for (const attendee of mirror.attendees ?? []) {
      await this.recordAttendee(session, attendee);
      recorded++;
    }
    await this.setIntegration(sessionId, { attendanceSyncedAt: new Date() });
    return { attendees: recorded };
  }

  /** Marca individual (webhook o reconciliación). Cruce por documento y luego por correo (flujo 03 §5). */
  async recordAttendee(session: SessionContext, attendee: AttendanceAttendee) {
    const event = session.activity.edition.mainEvent;
    const participants = await this.prisma.eventParticipant.findMany({ where: { editionId: session.activity.editionId, status: { not: 'CANCELLED' } }, include: { profile: { include: { authUser: { select: { email: true } } } } } });
    const document = attendee.document_number?.trim().toUpperCase().replace(/\s+/g, '');
    const email = attendee.user_email?.trim().toLowerCase();
    let participantId = (document && participants.find((item) => item.profile.identityDocumentNumber?.trim().toUpperCase().replace(/\s+/g, '') === document)?.id)
      || (email && participants.find((item) => emailsOf(item.profile).includes(email))?.id) || null;
    if (!participantId) {
      const [firstName, ...rest] = (attendee.user_name || 'Participante').trim().split(/\s+/);
      const result = await this.prisma.$transaction((tx) => this.registrations.register(tx, {
        eventId: event.id, editionId: session.activity.editionId, origin: 'ONSITE', reviewConflicts: true,
        person: { firstName: firstName || 'Participante', lastName: rest.join(' ') || '-', email, identityDocumentType: document ? (/^\d{8}$/.test(document) ? 'DNI' : 'OTROS') : null, identityDocumentNumber: document || null },
      }), { timeout: 20_000 });
      participantId = result.participant.id;
    }
    await this.prisma.$transaction((tx) => this.attendance.recordExternal(tx, { participantId: participantId!, sessionId: session.id, method: 'QR', source: 'qr', valid: true, externalRef: `attendance:${attendee.id}` }));
    return participantId;
  }

  /** Persona nueva capturada en sede por Asistencia: Eventos escribe en el Directorio y crea la inscripción (flujo 03 §4). */
  async registerOnsitePerson(input: { attendanceEventId?: string; sessionId?: string; person: { firstName: string; lastName: string; email?: string; documentType?: string; documentNumber?: string; phone?: string } }) {
    const integration = input.sessionId
      ? await this.prisma.sessionIntegration.findUnique({ where: { sessionId: input.sessionId } })
      : input.attendanceEventId ? await this.prisma.sessionIntegration.findFirst({ where: { attendanceEventId: input.attendanceEventId } }) : null;
    const sessionId = integration?.sessionId ?? input.sessionId;
    if (!sessionId) throw new NotFoundException('Evento espejo no encontrado');
    const session = await this.load(sessionId);
    const result = await this.prisma.$transaction((tx) => this.registrations.register(tx, {
      eventId: session.activity.edition.mainEventId, editionId: session.activity.editionId, origin: 'ONSITE', reviewConflicts: true,
      person: { firstName: input.person.firstName, lastName: input.person.lastName, email: input.person.email, identityDocumentType: input.person.documentType ?? (input.person.documentNumber ? 'DNI' : null), identityDocumentNumber: input.person.documentNumber ?? null, phone: input.person.phone },
    }), { timeout: 20_000 });
    await this.registrations.afterCommit(result.participant.id);
    return { personId: result.profile.id, registrationId: result.participant.id, status: result.participant.status, needsReview: !!result.review };
  }

  /** Respaldo de webhooks perdidos: importa reportes de Zoom y reconcilia espejos de sesiones terminadas. */
  async reconcileTick() {
    const now = Date.now();
    const recent = { gte: new Date(now - 3 * 86_400_000), lte: new Date(now - 15 * 60_000) };
    const zoomSessions = await this.prisma.eventSession.findMany({
      where: { endsAt: recent, integration: { zoomMeetingId: { not: null } }, activity: { edition: { mainEvent: { virtualAttendanceMode: 'AUTOMATIC' } } }, attendanceRecords: { none: { method: 'ZOOM' } } },
      select: { id: true },
    });
    for (const session of zoomSessions) await this.jobs.enqueue(JOB.ZOOM_IMPORT, { sessionId: session.id }, { dedupeKey: `zoom-import:${session.id}` });
    const mirrored = await this.prisma.eventSession.findMany({ where: { endsAt: recent, integration: { attendanceEventId: { not: null } } }, include: { integration: true } });
    for (const session of mirrored) {
      if (session.integration?.attendanceSyncedAt && session.endsAt && session.integration.attendanceSyncedAt > session.endsAt) continue;
      await this.jobs.enqueue(JOB.ATTENDANCE_RECONCILE, { sessionId: session.id }, { dedupeKey: `attendance-reconcile:${session.id}` });
    }
    return { zoomImports: zoomSessions.length, attendanceReconciles: mirrored.length };
  }

  async hostStartUrl(sessionId: string) {
    const integration = await this.prisma.sessionIntegration.findUnique({ where: { sessionId } });
    if (!integration?.zoomStartUrlEnc) throw new BadRequestException('La sesión no tiene reunión de Zoom');
    return { startUrl: decryptSecret(integration.zoomStartUrlEnc) };
  }

  async load(sessionId: string): Promise<SessionContext> {
    const session = await this.prisma.eventSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    if (!session) throw new PermanentError('Sesión no encontrada');
    return session;
  }

  private setIntegration(sessionId: string, data: Omit<Prisma.SessionIntegrationUncheckedCreateInput, 'sessionId'>) {
    return this.prisma.sessionIntegration.upsert({ where: { sessionId }, create: { sessionId, ...data }, update: data }).then(() => undefined);
  }

  private modality(session: SessionContext) {
    return session.modality ?? session.activity.edition.mainEvent.eventMode ?? 'PHYSICAL';
  }

  private isVirtual(session: SessionContext) {
    return ['ONLINE', 'HYBRID'].includes(this.modality(session));
  }

  private isPhysical(session: SessionContext) {
    return ['PHYSICAL', 'HYBRID'].includes(this.modality(session));
  }

  private window(session: SessionContext) {
    return session.startsAt && session.endsAt && session.endsAt > session.startsAt ? { start: session.startsAt, end: session.endsAt } : null;
  }
}

const asStrings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
function emailsOf(profile: { primaryEmail: string | null; additionalEmails: unknown; authUser?: { email: string } | null }) {
  return [profile.primaryEmail, profile.authUser?.email, ...asStrings(profile.additionalEmails)].filter(Boolean).map((value) => value!.trim().toLowerCase());
}
