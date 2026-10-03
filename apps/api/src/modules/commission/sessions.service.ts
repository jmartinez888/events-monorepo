import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SessionType, SessionMode, AttendanceStatus, MinuteStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Sessions CRUD ─────────────────────────────────────────────────

  list(organizationId: string, year?: number) {
    return this.prisma.commissionSession.findMany({
      where: { organizationId, ...(year ? { year } : {}) },
      include: { _count: { select: { attendances: true, agreements: true } } },
      orderBy: [{ year: 'desc' }, { sessionNumber: 'desc' }],
    });
  }

  async get(id: string) {
    const session = await this.prisma.commissionSession.findUnique({
      where: { id },
      include: {
        agendaItems: { orderBy: { orderIndex: 'asc' } },
        attendances: { include: { institution: true } },
        minute: true,
        documents: { orderBy: { createdAt: 'desc' } },
        agreements: { include: { institution: true, evidences: true } },
      },
    });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    return session;
  }

  create(organizationId: string, data: Record<string, any>) {
    const type = (['ORDINARY', 'EXTRAORDINARY'].includes(data.type) ? data.type : 'ORDINARY') as SessionType;
    const mode = (['IN_PERSON', 'VIRTUAL', 'HYBRID'].includes(data.mode) ? data.mode : 'IN_PERSON') as SessionMode;
    return this.prisma.commissionSession.create({
      data: {
        organizationId,
        sessionNumber: Number(data.sessionNumber),
        year: Number(data.year),
        title: data.title,
        type,
        mode,
        scheduledDate: new Date(data.scheduledDate),
        startTime: data.startTime,
        endTime: data.endTime || null,
        location: data.location || null,
        virtualMeetingUrl: data.virtualMeetingUrl || null,
        quorumRequired: Number(data.quorumRequired) || 12,
      },
    });
  }

  async update(id: string, data: Record<string, unknown>) {
    const input: Record<string, unknown> = {};
    const strings = ['title', 'startTime', 'endTime', 'location', 'virtualMeetingUrl'] as const;
    for (const key of strings) if (data[key] !== undefined) input[key] = data[key];
    if (data.sessionNumber !== undefined) input.sessionNumber = Number(data.sessionNumber);
    if (data.year !== undefined) input.year = Number(data.year);
    if (data.quorumRequired !== undefined) input.quorumRequired = Number(data.quorumRequired);
    if (data.type !== undefined) input.type = data.type;
    if (data.mode !== undefined) input.mode = data.mode;
    if (data.scheduledDate !== undefined) input.scheduledDate = new Date(data.scheduledDate as string);
    if (data.isClosed !== undefined) input.isClosed = Boolean(data.isClosed);
    return this.prisma.commissionSession.update({ where: { id }, data: input });
  }

  remove(id: string) {
    return this.prisma.commissionSession.delete({ where: { id } });
  }

  // ── Agenda items ──────────────────────────────────────────────────

  addAgendaItem(sessionId: string, data: Record<string, any>) {
    return this.prisma.sessionAgendaItem.create({
      data: {
        sessionId,
        orderIndex: Number(data.orderIndex) || 1,
        topic: data.topic,
        presenterInstitution: data.presenterInstitution || null,
        presenterName: data.presenterName || null,
        durationMinutes: data.durationMinutes ? Number(data.durationMinutes) : null,
      },
    });
  }

  removeAgendaItem(id: string) {
    return this.prisma.sessionAgendaItem.delete({ where: { id } });
  }

  // ── Attendance & quorum ───────────────────────────────────────────

  async setAttendance(sessionId: string, institutionId: string, data: Record<string, any>) {
    const validStatuses: AttendanceStatus[] = ['PRESENT_PRINCIPAL', 'PRESENT_ALTERNATE', 'ABSENT', 'JUSTIFIED'];
    const status = validStatuses.includes(data.status) ? data.status : 'ABSENT';

    const record = await this.prisma.sessionAttendance.upsert({
      where: { sessionId_institutionId: { sessionId, institutionId } },
      create: {
        sessionId,
        institutionId,
        status,
        attendeeName: data.attendeeName || null,
        notes: data.notes || null,
        registeredAt: new Date(),
      },
      update: {
        status,
        attendeeName: data.attendeeName || null,
        notes: data.notes || null,
        registeredAt: new Date(),
      },
    });

    // Recalculate quorum
    const presentCount = await this.prisma.sessionAttendance.count({
      where: { sessionId, status: { in: ['PRESENT_PRINCIPAL', 'PRESENT_ALTERNATE'] } },
    });
    const session = await this.prisma.commissionSession.findUnique({ where: { id: sessionId }, select: { quorumRequired: true } });
    await this.prisma.commissionSession.update({
      where: { id: sessionId },
      data: { quorumReached: presentCount >= (session?.quorumRequired ?? 12) },
    });

    return record;
  }

  // ── Minutes ───────────────────────────────────────────────────────

  async upsertMinute(sessionId: string, data: Record<string, any>) {
    const validStatuses: MinuteStatus[] = ['MINUTE_DRAFT', 'IN_REVIEW', 'MINUTE_APPROVED', 'SIGNED'];
    const status = validStatuses.includes(data.status) ? data.status : 'MINUTE_DRAFT';
    return this.prisma.sessionMinute.upsert({
      where: { sessionId },
      create: {
        sessionId,
        minuteCode: data.minuteCode,
        status,
        summary: data.summary || null,
        contentHtml: data.contentHtml || null,
        generatedPdfUrl: data.generatedPdfUrl || null,
        signedPdfUrl: data.signedPdfUrl || null,
        isPublic: Boolean(data.isPublic),
        approvedAt: status === 'MINUTE_APPROVED' || status === 'SIGNED' ? new Date() : null,
      },
      update: {
        status,
        summary: data.summary,
        contentHtml: data.contentHtml,
        generatedPdfUrl: data.generatedPdfUrl,
        signedPdfUrl: data.signedPdfUrl,
        isPublic: data.isPublic !== undefined ? Boolean(data.isPublic) : undefined,
        approvedAt: status === 'MINUTE_APPROVED' || status === 'SIGNED' ? new Date() : undefined,
      },
    });
  }

  // ── Session documents ─────────────────────────────────────────────

  addDocument(sessionId: string, data: Record<string, any>) {
    const validCategories = ['PRESENTATION', 'REPORT', 'NORMATIVE', 'OTHER'];
    return this.prisma.sessionDocument.create({
      data: {
        sessionId,
        title: data.title,
        category: validCategories.includes(data.category) ? data.category : 'OTHER',
        fileUrl: data.fileUrl,
        fileSizeBytes: data.fileSizeBytes ? Number(data.fileSizeBytes) : null,
        isPublic: Boolean(data.isPublic),
      },
    });
  }

  removeDocument(id: string) {
    return this.prisma.sessionDocument.delete({ where: { id } });
  }
}
