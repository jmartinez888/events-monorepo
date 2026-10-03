import { Injectable, NotFoundException } from '@nestjs/common';
import { AgreementStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Agreements CRUD ───────────────────────────────────────────────

  list(organizationId: string, filters?: { institutionId?: string; status?: string; year?: number }) {
    const where: Record<string, any> = {
      session: { organizationId },
    };
    if (filters?.institutionId) where.institutionId = filters.institutionId;
    if (filters?.status) where.status = filters.status;
    if (filters?.year) where.session = { ...where.session, year: filters.year };

    return this.prisma.commissionAgreement.findMany({
      where,
      include: { session: { select: { id: true, title: true, sessionNumber: true, year: true } }, institution: { select: { id: true, name: true, acronym: true } }, _count: { select: { evidences: true } } },
      orderBy: { deadline: 'asc' },
    });
  }

  async get(id: string) {
    const agreement = await this.prisma.commissionAgreement.findUnique({
      where: { id },
      include: { session: true, institution: true, evidences: { orderBy: { uploadedAt: 'desc' } } },
    });
    if (!agreement) throw new NotFoundException('Acuerdo no encontrado');
    return agreement;
  }

  create(sessionId: string, data: Record<string, any>) {
    const validStatuses: AgreementStatus[] = ['PENDING', 'IN_PROGRESS', 'FULFILLED', 'OVERDUE'];
    const status = validStatuses.includes(data.status) ? data.status : 'PENDING';
    return this.prisma.commissionAgreement.create({
      data: {
        sessionId,
        institutionId: data.institutionId,
        agreementCode: data.agreementCode,
        description: data.description,
        deadline: new Date(data.deadline),
        status,
        priority: data.priority || 'MEDIA',
      },
    });
  }

  async update(id: string, data: Record<string, unknown>) {
    const input: Record<string, unknown> = {};
    if (data.description !== undefined) input.description = data.description;
    if (data.agreementCode !== undefined) input.agreementCode = data.agreementCode;
    if (data.institutionId !== undefined) input.institutionId = data.institutionId;
    if (data.priority !== undefined) input.priority = data.priority;
    if (data.progressNotes !== undefined) input.progressNotes = data.progressNotes;
    if (data.deadline !== undefined) input.deadline = new Date(data.deadline as string);
    if (data.status !== undefined) {
      input.status = data.status;
      if (data.status === 'FULFILLED') input.completedAt = new Date();
    }
    return this.prisma.commissionAgreement.update({ where: { id }, data: input });
  }

  remove(id: string) {
    return this.prisma.commissionAgreement.delete({ where: { id } });
  }

  // ── Evidences ─────────────────────────────────────────────────────

  addEvidence(agreementId: string, data: Record<string, any>) {
    return this.prisma.agreementEvidence.create({
      data: {
        agreementId,
        title: data.title,
        fileUrl: data.fileUrl,
        fileType: data.fileType || null,
        fileSizeBytes: data.fileSizeBytes ? Number(data.fileSizeBytes) : null,
        uploadedBy: data.uploadedBy || null,
        notes: data.notes || null,
      },
    });
  }

  removeEvidence(id: string) {
    return this.prisma.agreementEvidence.delete({ where: { id } });
  }

  // ── Dashboard stats ───────────────────────────────────────────────

  async stats(organizationId: string) {
    const [total, pending, inProgress, fulfilled, overdue, sessionsCount] = await Promise.all([
      this.prisma.commissionAgreement.count({ where: { session: { organizationId } } }),
      this.prisma.commissionAgreement.count({ where: { session: { organizationId }, status: 'PENDING' } }),
      this.prisma.commissionAgreement.count({ where: { session: { organizationId }, status: 'IN_PROGRESS' } }),
      this.prisma.commissionAgreement.count({ where: { session: { organizationId }, status: 'FULFILLED' } }),
      this.prisma.commissionAgreement.count({ where: { session: { organizationId }, status: 'OVERDUE' } }),
      this.prisma.commissionSession.count({ where: { organizationId } }),
    ]);
    return { total, pending, inProgress, fulfilled, overdue, sessionsCount, complianceRate: total > 0 ? Math.round((fulfilled / total) * 100) : 0 };
  }
}
