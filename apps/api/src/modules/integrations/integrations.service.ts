import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VirtualAttendanceMode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { Actor, EventAccessService } from '../../common/event-access.service.js';
import { IntegrationJobsService } from './integration-jobs.service.js';
import { SessionSyncService, JOB } from './session-sync.service.js';
import { ZoomClient } from './providers/zoom.client.js';
import { FacebookClient } from './providers/facebook.client.js';
import { AttendanceClient } from './providers/attendance.client.js';
import { CertificatesClient } from './providers/certificates.client.js';
import { TelegramClient } from './providers/telegram.client.js';
import { RegistrationsService } from '../registrations/registrations.service.js';
import { STORAGE, StoragePort } from '../storage/storage.port.js';

export interface EventSettingsInput {
  virtualAttendanceMode?: VirtualAttendanceMode;
  attendanceThreshold?: number;
  capacity?: number | null;
  waitlistEnabled?: boolean;
  reminderOffsets?: number[];
  zoomEnabled?: boolean;
  facebookLiveEnabled?: boolean;
  attendanceMirrorEnabled?: boolean;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EventAccessService,
    private readonly jobs: IntegrationJobsService,
    private readonly sync: SessionSyncService,
    private readonly registrations: RegistrationsService,
    private readonly zoom: ZoomClient,
    private readonly facebook: FacebookClient,
    private readonly attendanceApi: AttendanceClient,
    private readonly certificates: CertificatesClient,
    private readonly telegram: TelegramClient,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  /** Estado sin secretos: nunca expone start_url de Zoom ni la clave RTMP. */
  async overview(eventId: string, actor: Actor) {
    await this.access.assertEvent(eventId, actor, 'READ');
    const event = await this.prisma.mainEvent.findUniqueOrThrow({ where: { id: eventId }, select: settingsSelect });
    const sessions = await this.prisma.eventSession.findMany({
      where: { activity: { edition: { mainEventId: eventId } } },
      orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
      select: {
        id: true, title: true, startsAt: true, endsAt: true, modality: true,
        activity: { select: { title: true, edition: { select: { id: true, name: true } } } },
        integration: { select: { zoomMeetingId: true, zoomJoinUrl: true, zoomStatus: true, zoomError: true, zoomEndedAt: true, facebookLiveUrl: true, facebookStatus: true, facebookError: true, attendanceEventId: true, attendanceStatus: true, attendanceError: true, attendanceSyncedAt: true, updatedAt: true } },
        _count: { select: { registrations: true, attendanceRecords: true } },
      },
    });
    const registrantErrors = await this.prisma.sessionRegistration.groupBy({ by: ['sessionId', 'status'], where: { session: { activity: { edition: { mainEventId: eventId } } } }, _count: true });
    const failedJobs = await this.prisma.integrationJob.findMany({ where: { status: 'FAILED', OR: sessions.map((session) => ({ payload: { path: ['sessionId'], equals: session.id } })) }, orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, kind: true, payload: true, lastError: true, attempts: true, updatedAt: true } });
    return {
      providers: { zoom: this.zoom.configured, zoomWebhook: this.zoom.webhookConfigured, facebook: this.facebook.configured, attendance: this.attendanceApi.configured, certificates: this.certificates.configured, telegram: this.telegram.configured, storage: this.storage.driver },
      settings: event,
      sessions: sessions.map((session) => ({ ...session, registrants: registrantErrors.filter((item) => item.sessionId === session.id).map((item) => ({ status: item.status, count: item._count })) })),
      failedJobs: sessions.length ? failedJobs : [],
    };
  }

  async updateSettings(eventId: string, input: EventSettingsInput, actor: Actor) {
    await this.access.assertManager(eventId, actor);
    if (input.attendanceThreshold !== undefined && (input.attendanceThreshold < 0 || input.attendanceThreshold > 1)) throw new BadRequestException('El umbral de permanencia va de 0 a 1 (ej. 0.8 = 80 %)');
    if (input.capacity !== undefined && input.capacity !== null && input.capacity < 1) throw new BadRequestException('El aforo debe ser mayor que cero o vacío');
    const offsets = input.reminderOffsets ? [...new Set(input.reminderOffsets.map(Math.round))].filter((value) => value > 0 && value <= 60 * 24 * 30).sort((a, b) => b - a) : undefined;
    const before = await this.prisma.mainEvent.findUniqueOrThrow({ where: { id: eventId }, select: settingsSelect });
    const data: Prisma.MainEventUpdateInput = {
      virtualAttendanceMode: input.virtualAttendanceMode,
      attendanceThreshold: input.attendanceThreshold,
      capacity: input.capacity,
      waitlistEnabled: input.waitlistEnabled,
      reminderOffsets: offsets,
      zoomEnabled: input.zoomEnabled,
      facebookLiveEnabled: input.facebookLiveEnabled,
      attendanceMirrorEnabled: input.attendanceMirrorEnabled,
    };
    const updated = await this.prisma.mainEvent.update({ where: { id: eventId }, data, select: settingsSelect });
    const integrationsChanged = before.zoomEnabled !== updated.zoomEnabled || before.facebookLiveEnabled !== updated.facebookLiveEnabled || before.attendanceMirrorEnabled !== updated.attendanceMirrorEnabled;
    if (integrationsChanged || JSON.stringify(before.reminderOffsets) !== JSON.stringify(updated.reminderOffsets)) await this.sync.enqueueEvent(eventId);
    if ((updated.capacity ?? Infinity) > (before.capacity ?? Infinity) || (before.capacity !== null && updated.capacity === null)) await this.registrations.promoteWaitlist(eventId);
    return updated;
  }

  /** Sincroniza ahora todas las sesiones: encola y procesa sin esperar al ciclo del worker. */
  async syncNow(eventId: string, actor: Actor) {
    await this.access.assertManager(eventId, actor);
    const result = await this.sync.enqueueEvent(eventId);
    await this.jobs.processDue(50);
    await this.jobs.processDue(50);
    return result;
  }

  async importZoom(sessionId: string, actor: Actor) {
    await this.access.assertFor({ sessionId }, actor, 'MANAGE');
    return this.sync.importZoomAttendance(sessionId);
  }

  async reconcileAttendance(sessionId: string, actor: Actor) {
    await this.access.assertFor({ sessionId }, actor, 'MANAGE');
    return this.sync.reconcileAttendance(sessionId);
  }

  async hostStartUrl(sessionId: string, actor: Actor) {
    await this.access.assertFor({ sessionId }, actor, 'MANAGE');
    return this.sync.hostStartUrl(sessionId);
  }

  async retryJob(jobId: string, actor: Actor) {
    const job = await this.prisma.integrationJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Trabajo no encontrado');
    const sessionId = (job.payload as Record<string, unknown>)?.sessionId;
    if (typeof sessionId !== 'string') throw new BadRequestException('Este trabajo no pertenece a una sesión');
    await this.access.assertFor({ sessionId }, actor, 'MANAGE');
    await this.prisma.integrationJob.update({ where: { id: jobId }, data: { status: 'QUEUED', attempts: 0, runAt: new Date(), lastError: null } });
    await this.jobs.processDue(10);
    return this.prisma.integrationJob.findUnique({ where: { id: jobId }, select: { id: true, kind: true, status: true, lastError: true } });
  }

  /** Para el webhook meeting.ended: importa tras unos minutos, cuando Zoom ya publicó el reporte. */
  async onZoomMeetingEnded(meetingId: string) {
    const integration = await this.prisma.sessionIntegration.findFirst({ where: { zoomMeetingId: meetingId }, include: { session: { include: { activity: { include: { edition: { include: { mainEvent: { select: { virtualAttendanceMode: true } } } } } } } } } });
    if (!integration) return { matched: false };
    await this.prisma.sessionIntegration.update({ where: { id: integration.id }, data: { zoomEndedAt: new Date() } });
    if (integration.session.activity.edition.mainEvent.virtualAttendanceMode === 'AUTOMATIC') {
      await this.jobs.enqueue(JOB.ZOOM_IMPORT, { sessionId: integration.sessionId }, { dedupeKey: `zoom-import:${integration.sessionId}`, runAt: new Date(Date.now() + 5 * 60_000) });
    }
    return { matched: true };
  }

  async onZoomMeetingUpdated(meetingId: string) {
    const integration = await this.prisma.sessionIntegration.findFirst({ where: { zoomMeetingId: meetingId } });
    // Eventos es la fuente de verdad: un cambio hecho en Zoom se reconcilia con los datos de Eventos.
    if (integration) await this.jobs.enqueue(JOB.ZOOM_SYNC, { sessionId: integration.sessionId }, { dedupeKey: `zoom-sync:${integration.sessionId}` });
    return { matched: !!integration };
  }
}

const settingsSelect = { id: true, eventName: true, eventMode: true, virtualAttendanceMode: true, attendanceThreshold: true, capacity: true, waitlistEnabled: true, reminderOffsets: true, zoomEnabled: true, facebookLiveEnabled: true, attendanceMirrorEnabled: true } satisfies Prisma.MainEventSelect;
