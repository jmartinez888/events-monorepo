import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { Actor, EventAccessService } from '../../common/event-access.service.js';

export interface AttendanceInput { participantIds: string[]; valid: boolean; sessionId?: string; note?: string }

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService, private readonly access: EventAccessService) {}

  async list(eventId: string, actor: Actor) {
    await this.access.assertManager(eventId, actor);
    return this.prisma.attendanceRecord.findMany({
      where: { participant: { edition: { mainEventId: eventId } } },
      include: { audits: { orderBy: { createdAt: 'desc' }, take: 20 } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async approveBulk(eventId: string, input: AttendanceInput, actor: Actor) {
    if (!input.participantIds.length || input.participantIds.length > 200 || typeof input.valid !== 'boolean') throw new BadRequestException('Selecciona entre 1 y 200 participantes');
    const ids = [...new Set(input.participantIds)].sort();
    return this.prisma.$transaction(async (tx) => {
      await this.access.assertManager(eventId, actor, tx);
      // Serialize with local certificate issuance and role changes for this event.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-operations:${eventId}`}, 0))::text`;
      const participants = await tx.eventParticipant.findMany({ where: { id: { in: ids }, edition: { mainEventId: eventId } }, select: { id: true, editionId: true } });
      if (participants.length !== ids.length) throw new NotFoundException('Algún participante no pertenece a este evento');
      if (input.sessionId) {
        const session = await tx.eventSession.findFirst({ where: { id: input.sessionId, activity: { edition: { mainEventId: eventId } } }, select: { activity: { select: { editionId: true } } } });
        if (!session || participants.some((participant) => participant.editionId !== session.activity.editionId)) throw new BadRequestException('La sesión debe pertenecer a la edición de todos los participantes');
      }
      if (!input.valid && await tx.participantCertificate.count({ where: { participantId: { in: ids }, status: 'ISSUED' } })) throw new ConflictException('Revoca los certificados emitidos antes de retirar la asistencia');
      const batchId = randomUUID();
      const scopeKey = input.sessionId || 'EVENT';
      const now = new Date();
      let changed = 0;
      for (const participantId of ids) {
        const previous = await tx.attendanceRecord.findUnique({ where: { participantId_scopeKey: { participantId, scopeKey } } });
        // A retry with the same validity is a no-op; do not rewrite attribution.
        if (previous?.valid === input.valid) continue;
        const record = await tx.attendanceRecord.upsert({
          where: { participantId_scopeKey: { participantId, scopeKey } },
          create: { participantId, sessionId: input.sessionId, scopeKey, valid: input.valid, approvedBy: actor.accountId!, approvedAt: now, note: input.note?.trim() || null },
          update: { method: 'MANUAL', source: 'MANUAL_APPROVAL', valid: input.valid, approvedBy: actor.accountId!, approvedAt: now, note: input.note?.trim() || null },
        });
        await tx.attendanceAudit.create({ data: { recordId: record.id, batchId, actorId: actor.accountId!, previousValid: previous?.valid, valid: input.valid, note: input.note?.trim() || null } });
        if (!input.sessionId) await tx.eventParticipant.update({ where: { id: participantId }, data: { checkedIn: input.valid } });
        changed++;
      }
      return { batchId, selected: ids.length, changed, valid: input.valid };
    }, { timeout: 20_000 });
  }

  /**
   * Marca de un sistema externo (QR de Asistencia o reporte de Zoom), con el
   * mismo formato que la aprobación manual (flujo 04 §6). Una decisión humana
   * previa prevalece: el sistema solo completa minutos y referencia.
   */
  async recordExternal(tx: Prisma.TransactionClient, input: ExternalAttendance) {
    const scopeKey = input.sessionId || 'EVENT';
    const previous = await tx.attendanceRecord.findUnique({ where: { participantId_scopeKey: { participantId: input.participantId, scopeKey } } });
    const humanDecision = previous?.method === 'MANUAL' && !!previous.approvedBy;
    const record = previous
      ? await tx.attendanceRecord.update({
        where: { id: previous.id },
        data: humanDecision
          ? { minutes: input.minutes ?? previous.minutes, percentage: input.percentage ?? previous.percentage, externalRef: input.externalRef ?? previous.externalRef }
          : { method: input.method, source: input.source, valid: input.valid, minutes: input.minutes, percentage: input.percentage, externalRef: input.externalRef, approvedBy: null, approvedAt: new Date() },
      })
      : await tx.attendanceRecord.create({ data: { participantId: input.participantId, sessionId: input.sessionId, scopeKey, method: input.method, source: input.source, valid: input.valid, minutes: input.minutes, percentage: input.percentage, externalRef: input.externalRef, approvedAt: new Date() } });
    if (input.intervals) {
      await tx.attendanceInterval.deleteMany({ where: { recordId: record.id, source: input.source } });
      if (input.intervals.length) await tx.attendanceInterval.createMany({ data: input.intervals.map((interval) => ({ recordId: record.id, joinedAt: interval.joinedAt, leftAt: interval.leftAt, source: input.source })), skipDuplicates: true });
    }
    if (!input.sessionId && record.valid) await tx.eventParticipant.update({ where: { id: input.participantId }, data: { checkedIn: true } });
    return { record, keptHumanDecision: humanDecision };
  }

  /**
   * Asistencia válida para certificar. Una decisión sobre el evento completo
   * (aprobación o retiro del organizador) prevalece. Sin ella, en eventos
   * multi-sesión cuenta la proporción de sesiones válidas frente al umbral.
   */
  async hasValidAttendance(db: Prisma.TransactionClient | PrismaService, participantId: string) {
    const eventRecord = await db.attendanceRecord.findUnique({ where: { participantId_scopeKey: { participantId, scopeKey: 'EVENT' } }, select: { valid: true } });
    if (eventRecord) return eventRecord.valid;
    const participant = await db.eventParticipant.findUnique({ where: { id: participantId }, select: { editionId: true, edition: { select: { mainEvent: { select: { attendanceThreshold: true } } } } } });
    if (!participant) return false;
    const total = await db.eventSession.count({ where: { activity: { editionId: participant.editionId } } });
    if (!total) return false;
    const valid = await db.attendanceRecord.count({ where: { participantId, valid: true, sessionId: { not: null } } });
    return valid / total >= participant.edition.mainEvent.attendanceThreshold;
  }
}

export interface ExternalAttendance {
  participantId: string;
  sessionId: string | null;
  method: 'QR' | 'ZOOM';
  source: string;
  valid: boolean;
  minutes?: number;
  percentage?: number;
  externalRef?: string;
  intervals?: Array<{ joinedAt: Date; leftAt: Date }>;
}

/** Une tramos superpuestos (reconexiones, dos dispositivos) para no sumar minutos dos veces. */
export function mergeIntervals(intervals: Array<{ joinedAt: Date; leftAt: Date }>) {
  const sorted = intervals.filter((item) => item.leftAt > item.joinedAt).sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  const merged: Array<{ joinedAt: Date; leftAt: Date }> = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.joinedAt <= last.leftAt) {
      if (interval.leftAt > last.leftAt) last.leftAt = interval.leftAt;
    } else merged.push({ ...interval });
  }
  const minutes = Math.round(merged.reduce((sum, item) => sum + (item.leftAt.getTime() - item.joinedAt.getTime()), 0) / 60_000);
  return { merged, minutes };
}
