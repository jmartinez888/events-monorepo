import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { Actor, EventAccessService } from '../../common/event-access.service.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { IntegrationJobsService } from '../integrations/integration-jobs.service.js';
import { CertificatesClient } from '../integrations/providers/certificates.client.js';
import { config } from '../../common/config.js';

const ISSUE_JOB = 'CERTIFICATE_ISSUE';
const MAX_ISSUE_ATTEMPTS = 6;
const localCode = () => `CERT-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;

export interface IssueRequest { participantIds?: string[]; roleIds?: string[]; templateId?: string }
export interface Skipped { participantId: string; roleId: string | null; reason: string }

/**
 * Emisión por persona y rol (flujo 05). Cada rol define horas, glosa, plantilla y
 * si exige asistencia. Con CERTIFICATES_API_URL configurado, la emisión se
 * orquesta en el sistema de Certificados mediante una cola con clave de
 * idempotencia; si no, Eventos emite y verifica localmente.
 */
@Injectable()
export class CertificatesService implements OnModuleInit {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EventAccessService,
    private readonly attendance: AttendanceService,
    private readonly notifications: NotificationsService,
    private readonly jobs: IntegrationJobsService,
    private readonly external: CertificatesClient,
  ) {}

  onModuleInit() {
    this.jobs.register(ISSUE_JOB, (payload, job) => this.issueExternally(payload.certificateId, job.attempts));
  }

  async list(participantId: string | undefined, actor: Actor) {
    if (participantId) {
      await this.access.assertFor({ participantId }, actor, 'READ');
      return this.prisma.participantCertificate.findMany({ where: { participantId }, include: { participant: { include: { profile: true, edition: { include: { mainEvent: true } } } }, template: true, role: true }, orderBy: { issuedAt: 'desc' } });
    }
    await this.access.assertOrganization(null, actor, 'MANAGE');
    return this.prisma.participantCertificate.findMany({ include: { participant: { include: { profile: true, edition: { include: { mainEvent: true } } } }, template: true, role: true }, orderBy: { issuedAt: 'desc' }, take: 500 });
  }

  async listForEvent(eventId: string, actor: Actor) {
    await this.access.assertEvent(eventId, actor, 'READ');
    return this.prisma.participantCertificate.findMany({
      where: { participant: { edition: { mainEventId: eventId } } },
      include: { role: { select: { id: true, name: true, displayName: true } }, participant: { select: { id: true, profile: { select: { firstName: true, lastName: true, primaryEmail: true } } } } },
      orderBy: [{ issuedAt: 'desc' }],
    });
  }

  /** Verificación pública: solo lo necesario para comprobar autenticidad, sin documento ni correo. */
  async verify(code: string) {
    const certificate = await this.prisma.participantCertificate.findUnique({ where: { code }, include: { participant: { include: { profile: { select: { firstName: true, lastName: true } }, edition: { select: { name: true, mainEvent: { select: { eventName: true, startDate: true } } } } } }, template: { select: { id: true, name: true, design: true } }, role: { select: { displayName: true, name: true, certificateText: true } } } });
    if (!certificate || certificate.status === 'PENDING' || certificate.status === 'FAILED') throw new NotFoundException('Certificado no encontrado');
    await this.prisma.certificateTrackingLog.create({ data: { certificateId: certificate.id, action: 'verified' } });
    const { participant } = certificate;
    return {
      id: certificate.id, code: certificate.code, status: certificate.status, version: certificate.version, hours: certificate.hours, issuedAt: certificate.issuedAt, revokedAt: certificate.revokedAt,
      template: certificate.template,
      role: certificate.role ? { label: certificate.role.displayName || certificate.role.name, text: certificate.role.certificateText } : null,
      participant: { profile: participant.profile, edition: { name: participant.edition.name, mainEvent: { ...participant.edition.mainEvent, name: participant.edition.mainEvent.eventName } } },
    };
  }

  /** Compatibilidad: emisión individual del rol principal. */
  async issue(participantId: string, templateId: string | undefined, actor: Actor) {
    const participant = await this.prisma.eventParticipant.findUnique({ where: { id: participantId }, include: { edition: true } });
    if (!participant) throw new NotFoundException('Participante no encontrado');
    if (!participant.roleId) throw new BadRequestException('Asigna un rol activo antes de certificar');
    const result = await this.issueBulk(participant.edition.mainEventId, { participantIds: [participantId], roleIds: [participant.roleId], templateId }, actor);
    if (result.certificates[0]) return result.certificates[0];
    // Repetir la emisión devuelve el certificado vigente en lugar de duplicarlo.
    const current = await this.prisma.participantCertificate.findFirst({ where: { participantId, roleId: participant.roleId, status: { in: ['PENDING', 'ISSUED'] } } });
    if (current) {
      if (templateId && (current.templateId || undefined) !== templateId) throw new ConflictException('Ya existe un certificado emitido; revócalo antes de cambiar la plantilla');
      return current;
    }
    throw new BadRequestException(result.skipped[0]?.reason ?? 'No se pudo emitir el certificado');
  }

  /** Emite para cada persona y rol elegibles. Repetir la petición no duplica: un rol con certificado vigente se omite. */
  async issueBulk(eventId: string, request: IssueRequest, actor: Actor) {
    const { certificates, skipped } = await this.prisma.$transaction(async (tx) => {
      await this.access.assertManager(eventId, actor, tx);
      await this.access.lockEvent(tx, eventId);
      const participants = await tx.eventParticipant.findMany({
        where: { edition: { mainEventId: eventId }, id: request.participantIds?.length ? { in: request.participantIds } : undefined, status: { not: 'CANCELLED' } },
        include: { roleAssignments: { include: { role: true } } },
      });
      if (request.participantIds?.length && participants.length !== new Set(request.participantIds).size) throw new NotFoundException('Algún participante no pertenece a este evento o está cancelado');
      const created: Prisma.ParticipantCertificateGetPayload<{}>[] = [];
      const skipped: Skipped[] = [];
      for (const participant of participants) {
        const assignments = participant.roleAssignments.filter((assignment) => !request.roleIds?.length || request.roleIds.includes(assignment.roleId));
        if (!assignments.length) { skipped.push({ participantId: participant.id, roleId: null, reason: 'No tiene un rol certificable seleccionado' }); continue; }
        let attended: boolean | undefined;
        for (const assignment of assignments) {
          const role = assignment.role;
          if (!role.isActive) { skipped.push({ participantId: participant.id, roleId: role.id, reason: 'El rol no está activo' }); continue; }
          const current = await tx.participantCertificate.findFirst({ where: { participantId: participant.id, roleId: role.id, status: { in: ['PENDING', 'ISSUED'] } } });
          if (current) { skipped.push({ participantId: participant.id, roleId: role.id, reason: current.status === 'ISSUED' ? 'Ya tiene un certificado vigente para este rol' : 'La emisión de este rol está en curso' }); continue; }
          if (role.requiresAttendance && !assignment.directApprovedAt) {
            attended ??= await this.attendance.hasValidAttendance(tx, participant.id);
            if (!attended) { skipped.push({ participantId: participant.id, roleId: role.id, reason: 'El rol requiere asistencia válida' }); continue; }
          }
          created.push(await this.createVersion(tx, participant.id, role.id, role.certificateHours, request.templateId, actor));
        }
      }
      return { certificates: created, skipped };
    }, { timeout: 60_000 });
    await this.afterIssue(certificates.map((certificate) => certificate.id));
    return { issued: certificates.filter((item) => item.status === 'ISSUED').length, pending: certificates.filter((item) => item.status === 'PENDING').length, certificates, skipped };
  }

  /** Corrección posterior: la versión anterior queda SUPERSEDED y se emite la siguiente. */
  async reissue(certificateId: string, reason: string | undefined, actor: Actor) {
    const certificate = await this.prisma.$transaction(async (tx) => {
      const current = await tx.participantCertificate.findUnique({ where: { id: certificateId }, include: { participant: { include: { edition: true } }, role: true } });
      if (!current) throw new NotFoundException('Certificado no encontrado');
      await this.access.assertManager(current.participant.edition.mainEventId, actor, tx);
      await this.access.lockEvent(tx, current.participant.edition.mainEventId);
      if (!current.roleId || !current.role) throw new BadRequestException('Los certificados anteriores a los roles múltiples no se pueden reemitir; emite uno nuevo por rol');
      if (current.status === 'PENDING') throw new ConflictException('La emisión está en curso');
      if (current.status === 'SUPERSEDED') throw new ConflictException('Esta versión ya fue reemplazada');
      await tx.participantCertificate.update({ where: { id: current.id }, data: { status: 'SUPERSEDED', revokedAt: new Date(), revokedReason: reason?.trim() || 'Reemisión' } });
      return this.createVersion(tx, current.participantId, current.roleId, current.role.certificateHours, current.templateId ?? undefined, actor);
    });
    await this.afterIssue([certificate.id]);
    return certificate;
  }

  async revoke(certificateId: string, reason: string | undefined, actor: Actor) {
    const certificate = await this.prisma.participantCertificate.findUnique({ where: { id: certificateId }, include: { participant: { include: { edition: true } } } });
    if (!certificate) throw new NotFoundException('Certificado no encontrado');
    await this.access.assertManager(certificate.participant.edition.mainEventId, actor);
    if (certificate.status === 'REVOKED') return certificate;
    return this.prisma.participantCertificate.update({ where: { id: certificateId }, data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason?.trim() || null } });
  }

  /** Compatibilidad con PATCH /certificates/:id { status: 'REVOKED' }. */
  async update(id: string, data: { status?: string; reason?: string }, actor: Actor) {
    if (data.status !== 'REVOKED') throw new BadRequestException('Usa el flujo de emisión para emitir un certificado');
    return this.revoke(id, data.reason, actor);
  }

  /**
   * Atajo del flujo 04 §3: habilita el certificado de un rol sin asistencia, con
   * actor, fecha y motivo. Retirarlo no afecta certificados ya emitidos.
   */
  async directApproval(eventId: string, input: { participantIds: string[]; roleId: string; approved: boolean; reason?: string }, actor: Actor) {
    if (input.approved && !input.reason?.trim()) throw new BadRequestException('Indica el motivo de la aprobación directa');
    return this.prisma.$transaction(async (tx) => {
      await this.access.assertManager(eventId, actor, tx);
      await this.access.lockEvent(tx, eventId);
      const assignments = await tx.participantRoleAssignment.findMany({ where: { roleId: input.roleId, participantId: { in: input.participantIds }, participant: { edition: { mainEventId: eventId } } } });
      if (assignments.length !== new Set(input.participantIds).size) throw new BadRequestException('Todas las personas deben tener asignado ese rol en este evento');
      const result = await tx.participantRoleAssignment.updateMany({
        where: { roleId: input.roleId, participantId: { in: input.participantIds } },
        data: input.approved ? { directApprovedAt: new Date(), directApprovedBy: actor.accountId, directApprovalReason: input.reason!.trim() } : { directApprovedAt: null, directApprovedBy: null, directApprovalReason: null },
      });
      return { updated: result.count, approved: input.approved };
    });
  }

  async retryFailed(certificateId: string, actor: Actor) {
    const certificate = await this.prisma.participantCertificate.findUnique({ where: { id: certificateId }, include: { participant: { include: { edition: true } } } });
    if (!certificate) throw new NotFoundException('Certificado no encontrado');
    await this.access.assertManager(certificate.participant.edition.mainEventId, actor);
    if (certificate.status !== 'FAILED') throw new BadRequestException('Solo se reintenta una emisión fallida');
    await this.prisma.participantCertificate.update({ where: { id: certificateId }, data: { status: 'PENDING', lastError: null } });
    await this.afterIssue([certificateId]);
    return this.prisma.participantCertificate.findUnique({ where: { id: certificateId } });
  }

  templates() { return this.prisma.certificateTemplate.findMany({ orderBy: { createdAt: 'desc' } }); }
  createTemplate(data: { name: string; design?: unknown }) { return this.prisma.certificateTemplate.create({ data: { name: data.name, design: data.design as any } }); }
  updateTemplate(id: string, data: { name?: string; design?: unknown }) { return this.prisma.certificateTemplate.update({ where: { id }, data: { name: data.name, design: data.design as any } }); }
  removeTemplate(id: string) { return this.prisma.certificateTemplate.delete({ where: { id } }); }
  logs(certificateId: string) { return this.prisma.certificateTrackingLog.findMany({ where: { certificateId }, orderBy: { createdAt: 'desc' } }); }
  addLog(certificateId: string, action: string, ipAddress?: string) { return this.prisma.certificateTrackingLog.create({ data: { certificateId, action: action.slice(0, 50), ipAddress } }); }

  private async createVersion(tx: Prisma.TransactionClient, participantId: string, roleId: string, hours: number, templateId: string | undefined, actor: Actor) {
    const last = await tx.participantCertificate.findFirst({ where: { participantId, roleId }, orderBy: { version: 'desc' }, select: { version: true } });
    const version = (last?.version ?? 0) + 1;
    return tx.participantCertificate.create({
      data: {
        participantId, roleId, templateId, hours, version, code: localCode(), issuedBy: actor.accountId,
        idempotencyKey: `${participantId}:${roleId}:v${version}`,
        status: this.external.configured ? 'PENDING' : 'ISSUED',
      },
    });
  }

  private async afterIssue(ids: string[]) {
    for (const id of ids) {
      const certificate = await this.prisma.participantCertificate.findUnique({ where: { id }, select: { status: true } });
      if (certificate?.status === 'PENDING') await this.jobs.enqueue(ISSUE_JOB, { certificateId: id }, { dedupeKey: `certificate-issue:${id}`, maxAttempts: MAX_ISSUE_ATTEMPTS });
      else if (certificate?.status === 'ISSUED') {
        await this.prisma.participantCertificate.update({ where: { id }, data: { verifyUrl: `${config.panelUrl()}/validar/${(await this.prisma.participantCertificate.findUniqueOrThrow({ where: { id } })).code}` } });
        await this.notifications.notifyCertificate(id);
      }
    }
    if (ids.length) void this.jobs.processDue().catch((error) => this.logger.error('No se pudo procesar la cola de certificados', error));
  }

  /** Un fallo de un destinatario no bloquea al resto: cada certificado es su propio trabajo. */
  private async issueExternally(certificateId: string, attempt: number) {
    const certificate = await this.prisma.participantCertificate.findUnique({ where: { id: certificateId }, include: { role: true, participant: { include: { profile: true, edition: { include: { mainEvent: true } } } } } });
    if (!certificate || certificate.status !== 'PENDING' || !certificate.role || !certificate.idempotencyKey) return;
    const { profile, edition } = certificate.participant;
    try {
      const response = await this.external.issue({
        idempotencyKey: certificate.idempotencyKey,
        person: { directoryPersonId: profile.id, firstName: profile.firstName ?? '', lastName: profile.lastName ?? '', documentType: profile.identityDocumentType, documentNumber: profile.identityDocumentNumber, email: profile.primaryEmail },
        event: { id: edition.mainEventId, name: edition.mainEvent.eventName, editionId: edition.id, editionName: edition.name, startDate: (edition.startDate ?? edition.mainEvent.startDate).toISOString(), endDate: (edition.endDate ?? edition.mainEvent.endDate)?.toISOString() ?? null },
        role: { id: certificate.role.id, code: certificate.role.name, label: certificate.role.displayName || certificate.role.name, templateId: certificate.role.externalTemplateId, hours: certificate.hours ?? certificate.role.certificateHours, text: certificate.role.certificateText },
        version: certificate.version,
      });
      const codeTaken = response.code && response.code !== certificate.code && await this.prisma.participantCertificate.findUnique({ where: { code: response.code }, select: { id: true } });
      await this.prisma.participantCertificate.update({ where: { id: certificateId }, data: { status: 'ISSUED', externalId: response.id, code: response.code && !codeTaken ? response.code : undefined, verifyUrl: response.verifyUrl ?? null, attempts: { increment: 1 }, lastError: null, issuedAt: new Date() } });
      await this.notifications.notifyCertificate(certificateId);
    } catch (error: any) {
      const message = String(error?.message ?? error).slice(0, 1000);
      const final = attempt >= MAX_ISSUE_ATTEMPTS || error?.constructor?.name === 'PermanentError';
      await this.prisma.participantCertificate.update({ where: { id: certificateId }, data: { attempts: { increment: 1 }, lastError: message, status: final ? 'FAILED' : 'PENDING' } });
      throw error;
    }
  }
}
