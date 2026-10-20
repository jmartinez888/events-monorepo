import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { Actor, EventAccessService } from '../../common/event-access.service.js';

const profileSummary = { id: true, firstName: true, lastName: true, primaryEmail: true, identityDocumentType: true, identityDocumentNumber: true, authUserId: true, createdAt: true } as const;

/** Cola de revisión de posibles duplicados del Directorio (flujos 02 y 06). */
@Injectable()
export class DirectoryReviewsService {
  constructor(private readonly prisma: PrismaService, private readonly access: EventAccessService) {}

  async list(organizationId: string | undefined, status: string, actor: Actor) {
    await this.access.assertOrganization(organizationId ?? null, actor, 'MANAGE');
    const reviews = await this.prisma.directoryReview.findMany({ where: { organizationId: organizationId ?? null, status }, orderBy: { createdAt: 'desc' }, take: 200 });
    const ids = [...new Set(reviews.flatMap((review) => [review.provisionalProfileId, ...review.candidateProfileIds]))];
    const profiles = await this.prisma.profile.findMany({ where: { id: { in: ids } }, select: { ...profileSummary, participants: { select: { id: true, edition: { select: { name: true, mainEvent: { select: { eventName: true } } } } } } } });
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return reviews.map((review) => ({
      ...review,
      provisional: byId.get(review.provisionalProfileId) ?? null,
      candidates: review.candidateProfileIds.map((id) => byId.get(id)).filter(Boolean),
    }));
  }

  /**
   * KEEP_SEPARATE: son personas distintas. MERGE: el perfil provisional se une a
   * la persona elegida; sus inscripciones, ponencias y preferencias pasan a ella.
   */
  async resolve(reviewId: string, input: { action: 'KEEP_SEPARATE' | 'MERGE'; targetProfileId?: string }, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.directoryReview.findUnique({ where: { id: reviewId } });
      if (!review) throw new NotFoundException('Revisión no encontrada');
      await this.access.assertOrganization(review.organizationId, actor, 'MANAGE', tx);
      if (review.status !== 'OPEN') throw new ConflictException('La revisión ya fue resuelta');
      if (input.action === 'KEEP_SEPARATE') {
        return tx.directoryReview.update({ where: { id: reviewId }, data: { status: 'RESOLVED', resolution: 'KEEP_SEPARATE', resolvedBy: actor.accountId, resolvedAt: new Date() } });
      }
      if (input.action !== 'MERGE' || !input.targetProfileId) throw new BadRequestException('Indica la persona con la que se fusiona');
      if (!review.candidateProfileIds.includes(input.targetProfileId)) throw new BadRequestException('La persona elegida no es una candidata de esta revisión');
      await this.merge(tx, review.provisionalProfileId, input.targetProfileId);
      // Otras revisiones abiertas que apuntaban al provisional ya no tienen objeto.
      await tx.directoryReview.updateMany({ where: { provisionalProfileId: review.provisionalProfileId, status: 'OPEN', id: { not: reviewId } }, data: { status: 'RESOLVED', resolution: `MERGED_BY:${reviewId}`, resolvedBy: actor.accountId, resolvedAt: new Date() } });
      return tx.directoryReview.update({ where: { id: reviewId }, data: { status: 'RESOLVED', resolution: `MERGE:${input.targetProfileId}`, resolvedBy: actor.accountId, resolvedAt: new Date() } });
    }, { timeout: 30_000 });
  }

  private async merge(tx: Prisma.TransactionClient, sourceId: string, targetId: string) {
    if (sourceId === targetId) throw new BadRequestException('No se puede fusionar un perfil consigo mismo');
    const [source, target] = await Promise.all([tx.profile.findUnique({ where: { id: sourceId } }), tx.profile.findUnique({ where: { id: targetId } })]);
    if (!source || !target) throw new NotFoundException('Perfil no encontrado');
    if (source.authUserId && target.authUserId) throw new ForbiddenException('Ambos perfiles tienen cuenta; desvincula una cuenta antes de fusionar');
    const sourceEditions = await tx.eventParticipant.findMany({ where: { profileId: sourceId }, select: { editionId: true } });
    const clash = await tx.eventParticipant.count({ where: { profileId: targetId, editionId: { in: sourceEditions.map((item) => item.editionId) } } });
    if (clash) throw new ConflictException('Ambas personas están inscritas en la misma edición; resuelve esa inscripción antes de fusionar');
    const sourceSessions = await tx.sessionSpeaker.findMany({ where: { profileId: sourceId }, select: { sessionId: true } });
    if (await tx.sessionSpeaker.count({ where: { profileId: targetId, sessionId: { in: sourceSessions.map((item) => item.sessionId) } } })) throw new ConflictException('Ambas personas son expositoras de la misma sesión');

    await tx.eventParticipant.updateMany({ where: { profileId: sourceId }, data: { profileId: targetId } });
    await tx.sessionSpeaker.updateMany({ where: { profileId: sourceId }, data: { profileId: targetId } });
    await tx.notification.updateMany({ where: { profileId: sourceId }, data: { profileId: targetId } });
    await tx.registrationSubmission.updateMany({ where: { profileId: sourceId }, data: { profileId: targetId } });
    await tx.organizationMember.deleteMany({ where: { profileId: sourceId, organizationId: { in: (await tx.organizationMember.findMany({ where: { profileId: targetId }, select: { organizationId: true } })).map((item) => item.organizationId) } } });
    await tx.organizationMember.updateMany({ where: { profileId: sourceId }, data: { profileId: targetId } });
    const targetPreference = await tx.notificationPreference.findUnique({ where: { profileId: targetId } });
    if (targetPreference) await tx.notificationPreference.deleteMany({ where: { profileId: sourceId } });
    else await tx.notificationPreference.updateMany({ where: { profileId: sourceId }, data: { profileId: targetId } });

    const emails = new Set<string>();
    for (const value of [target.primaryEmail, source.primaryEmail, ...asStrings(target.additionalEmails), ...asStrings(source.additionalEmails)]) if (value) emails.add(value.trim().toLowerCase());
    await tx.profile.delete({ where: { id: sourceId } });
    await tx.profile.update({
      where: { id: targetId },
      data: {
        additionalEmails: [...emails],
        primaryEmail: target.primaryEmail ?? source.primaryEmail,
        identityDocumentType: target.identityDocumentType ?? source.identityDocumentType,
        identityDocumentNumber: target.identityDocumentNumber ?? source.identityDocumentNumber,
        authUserId: target.authUserId ?? source.authUserId,
        phone: target.phone ?? source.phone,
      },
    });
  }
}

const asStrings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
