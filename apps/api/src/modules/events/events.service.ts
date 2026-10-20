import { Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}
  list(organizationId?: string) { return this.prisma.mainEvent.findMany({ where: organizationId ? { organizationId } : undefined, include: { editions: true, details: true, thematicLines: true }, orderBy: { startDate: 'desc' } }); }
  async get(id: string) { const event = await this.prisma.mainEvent.findUnique({ where: { id }, include: { editions: { include: { activities: true, participants: true, tickets: true } }, details: true, thematicLines: true } }); if (!event) throw new NotFoundException('Evento no encontrado'); return event; }
  create(data: Record<string, any>) { return this.prisma.mainEvent.create({ data: { eventName: data.eventName, startDate: new Date(data.startDate), organizationId: data.organizationId, description: data.description, coverUrl: data.coverUrl, logoUrl: data.logoUrl, contactEmail: data.contactEmail, status: (data.status ? String(data.status).toUpperCase() : 'DRAFT') as EventStatus } }); }
  async update(id: string, data: Record<string, unknown>) {
    const { detailContent, ...eventData } = data;
    const input: any = {};
    for (const key of ['eventName', 'description', 'coverUrl', 'logoUrl', 'organizationId', 'contactEmail', 'whatsappCommunityUrl', 'venueAddress', 'latitude', 'longitude']) if (eventData[key] !== undefined) input[key] = eventData[key];
    if (eventData.eventMode !== undefined) {
      const mode = String(eventData.eventMode).trim().toUpperCase();
      input.eventMode = ['PHYSICAL', 'ONLINE', 'HYBRID'].includes(mode) ? mode : null;
    }
    if (eventData.status !== undefined) input.status = String(eventData.status).toUpperCase();
    if (typeof eventData.startDate === 'string') input.startDate = new Date(eventData.startDate);
    if (typeof eventData.endDate === 'string') input.endDate = new Date(eventData.endDate);
    const event = await this.prisma.mainEvent.update({ where: { id }, data: input });
    if (typeof detailContent === 'string') {
      await this.prisma.eventDetail.upsert({ where: { eventId: id }, create: { eventId: id, content: detailContent || null }, update: { content: detailContent || null } });
    }
    return event;
  }
  remove(id: string) { return this.prisma.mainEvent.delete({ where: { id } }); }
  async inheritSpeakers(targetEventId: string, sourceEventId: string, targetEditionId: string) {
    if (targetEventId === sourceEventId) throw new NotFoundException('Selecciona un evento anterior distinto');
    const [targetEvent, sourceEvent, targetEdition] = await Promise.all([
      this.prisma.mainEvent.findUnique({ where: { id: targetEventId }, select: { id: true, organizationId: true } }),
      this.prisma.mainEvent.findUnique({ where: { id: sourceEventId }, select: { id: true, organizationId: true } }),
      this.prisma.edition.findFirst({ where: { id: targetEditionId, mainEventId: targetEventId }, select: { id: true } }),
    ]);
    if (!targetEvent || !sourceEvent || !targetEdition) throw new NotFoundException('Evento o edición no encontrados');
    if (!targetEvent.organizationId || targetEvent.organizationId !== sourceEvent.organizationId) throw new NotFoundException('El evento de origen debe pertenecer a la misma institución');
    const people = await this.prisma.eventParticipant.findMany({
      where: { edition: { mainEventId: sourceEventId }, role: { isNot: null } },
      include: { role: true },
    });
    const speakers = people.filter((person) => /^(speaker(?:_mg)?|ponente(?:_mg)?)$/i.test(person.role?.name.trim() || ''));
    const roles = new Map<string, string>();
    await this.prisma.$transaction(async (tx) => {
      for (const person of speakers) {
        const roleName = person.role!.name;
        let role = roles.get(roleName);
        if (!role) {
          const existing = await tx.participantRole.findFirst({ where: { mainEventId: targetEventId, editionId: null, name: roleName } });
          role = existing?.id || (await tx.participantRole.create({ data: { mainEventId: targetEventId, name: roleName } })).id;
          roles.set(roleName, role);
        }
        await tx.eventParticipant.upsert({
          where: { editionId_profileId: { editionId: targetEditionId, profileId: person.profileId } },
          update: { roleId: role },
          create: { editionId: targetEditionId, profileId: person.profileId, roleId: role },
        });
      }
    });
    return { inherited: speakers.length };
  }
  async attendeeExport(eventId: string) {
    const [allParticipants, submissions] = await Promise.all([
      this.prisma.eventParticipant.findMany({ where: { edition: { mainEventId: eventId } }, include: { profile: { include: { authUser: { select: { email: true } } } }, edition: true, role: true, roleAssignments: { include: { role: true } }, attendanceRecords: { where: { scopeKey: 'EVENT' } } }, orderBy: { registeredAt: 'desc' } }),
      this.prisma.registrationSubmission.findMany({ where: { form: { mainEventId: eventId } }, include: { form: { include: { fields: true } } }, orderBy: { submittedAt: 'desc' } }),
    ]);
    const participants = allParticipants;
    const editionIds = submissions.map((submission) => submission.editionId).filter((editionId): editionId is string => Boolean(editionId));
    const editions = editionIds.length ? await this.prisma.edition.findMany({ where: { id: { in: editionIds } }, select: { id: true, name: true } }) : [];
    const editionNames = new Map(editions.map((edition) => [edition.id, edition.name]));
    const submissionsByParticipant = new Map(submissions.filter((submission) => submission.participantId).map((submission) => [submission.participantId!, submission]));
    const exportRow = (submission: typeof submissions[number] | undefined, fallback: Record<string, unknown>) => {
      const attributes = submission?.answers && typeof submission.answers === 'object' ? submission.answers as Record<string, unknown> : {};
      const labels = Object.fromEntries((submission?.form.fields || []).map((field) => [field.key, field.label]));
      // Mantener los nombres usados por el panel y por la exportación. Antes el
      // endpoint sólo entregaba `attributes`, por lo que el modal no tenía nada
      // que renderizar aunque la inscripción sí estuviera guardada.
      return {
        ...fallback,
        answers: attributes,
        attributes,
        attributeLabels: labels,
        formFields: (submission?.form.fields || []).map((field) => ({ key: field.key, label: field.label })),
      };
    };
    return [
      ...participants.map((participant) => {
        const emails = Array.isArray(participant.profile.additionalEmails) ? participant.profile.additionalEmails : [];
        const email = participant.profile.primaryEmail || participant.profile.authUser?.email || emails.find((value: unknown) => typeof value === 'string' && value.trim()) || '';
        const submission = submissionsByParticipant.get(participant.id);
        const assignedRoles = participant.roleAssignments.length ? participant.roleAssignments.map((assignment) => assignment.role) : participant.role ? [participant.role] : [];
        return exportRow(submission, { id: participant.id, participantId: participant.id, profileId: participant.profileId, roleId: participant.roleId, roleIds: assignedRoles.map((role) => role.id), roles: assignedRoles.map((role) => ({ id: role.id, name: role.displayName || role.name })), checkedIn: participant.attendanceRecords.some((record) => record.valid), attendance: participant.attendanceRecords[0] || null, identityDocumentType: participant.profile.identityDocumentType, identityDocumentNumber: participant.profile.identityDocumentNumber, submissionId: submission?.id, name: [participant.profile.firstName, participant.profile.lastName].filter(Boolean).join(' ') || 'Participante', email, edition: participant.edition.name, editionId: participant.editionId, source: submission?.form.title || 'Participante', sourceFormTitle: submission?.form.title, sourceFormId: submission?.formId, sourceFormPurpose: submission?.form.purpose, type: assignedRoles.map((role) => role.displayName || role.name).join(', ') || 'Participante', registeredAt: participant.registeredAt });
      }),
      ...submissions.filter((submission) => !submission.participantId).map((submission) => {
        const answers = submission.answers && typeof submission.answers === 'object' ? submission.answers as Record<string, unknown> : {};
        const name = String(answers.full_name || answers.name || answers.nombres_completos || [answers.first_name || answers.nombres, answers.last_name || answers.apellidos || answers.surname].filter(Boolean).join(' ') || submission.email || 'Participante');
        return exportRow(submission, { id: `form:${submission.id}`, submissionId: submission.id, name, email: submission.email || String(answers.email || ''), edition: submission.editionId ? editionNames.get(submission.editionId) || 'Global' : 'Global', editionId: submission.editionId || submission.form.editionId, source: submission.form.title, sourceFormTitle: submission.form.title, sourceFormId: submission.formId, sourceFormPurpose: submission.form.purpose, type: 'Inscripción', registeredAt: submission.submittedAt });
      }),
    ];
  }
  async attendees(eventId: string, page = 1, limit = 20, search?: string) {
    const all = await this.attendeeExport(eventId);
    const term = String(search || '').trim().toLowerCase();
    const filtered = term ? all.filter((item: any) => [item.name, item.email, item.edition, item.source, item.type].some((value) => String(value || '').toLowerCase().includes(term))) : all;
    const requestedPage = Math.max(1, page); const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.min(requestedPage, Math.max(1, Math.ceil(filtered.length / safeLimit)));
    return { items: filtered.slice((safePage - 1) * safeLimit, safePage * safeLimit), total: filtered.length, page: safePage, limit: safeLimit };
  }
  async getSetup(eventId: string) {
    const event = await this.prisma.mainEvent.findUnique({ where: { id: eventId }, select: { id: true, eventName: true, description: true, startDate: true, eventMode: true, contactEmail: true } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    const [editionCount, speakerCount, roleCount] = await Promise.all([
      this.prisma.edition.count({ where: { mainEventId: eventId } }),
      this.prisma.eventParticipant.count({ where: { edition: { mainEventId: eventId } } }),
      this.prisma.participantRole.count({ where: { mainEventId: eventId } }),
    ]);
    const computed = {
      basicInfoCompleted: Boolean(event.eventName?.trim() && event.startDate),
      rolesCompleted: roleCount > 0,
      editionCompleted: editionCount > 0,
      peopleCompleted: speakerCount > 0,
      // Los contactos se pueden añadir más adelante y no deben bloquear la
      // creación ni la administración del evento.
      contactCompleted: true,
    };
    const completed = Boolean(computed.basicInfoCompleted && computed.rolesCompleted && computed.editionCompleted && computed.peopleCompleted);
    return this.prisma.eventSetupProgress.upsert({ where: { eventId }, create: { eventId, ...computed, completed }, update: { ...computed, completed } });
  }
  async updateSetup(eventId: string, data: Record<string, unknown>) {
    await this.get(eventId);
    const allowed = ['basicInfoCompleted', 'rolesCompleted', 'editionCompleted', 'peopleCompleted', 'contactCompleted', 'currentStep'];
    const input: Record<string, unknown> = {};
    for (const key of allowed) if (data[key] !== undefined) input[key] = data[key];
    const current = await this.getSetup(eventId);
    const merged = { ...current, ...input };
    input.completed = Boolean(merged.basicInfoCompleted && merged.rolesCompleted && merged.editionCompleted && merged.peopleCompleted);
    return this.prisma.eventSetupProgress.update({ where: { eventId }, data: input });
  }
  async completeSetup(eventId: string) {
    const progress = await this.getSetup(eventId);
    if (!(progress.basicInfoCompleted && progress.rolesCompleted && progress.editionCompleted && progress.peopleCompleted)) {
      return this.updateSetup(eventId, {});
    }
    return this.prisma.eventSetupProgress.update({ where: { eventId }, data: { completed: true } });
  }
  contacts(eventId: string) { return this.prisma.eventContact.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' } }); }
  addContact(eventId: string, data: { name: string; email?: string; phone?: string; role?: string }) { return this.prisma.eventContact.create({ data: { eventId, ...data } }); }
  updateContact(id: string, data: { name?: string; email?: string; phone?: string; role?: string }) {
    const input = Object.fromEntries(Object.entries(data).filter(([key, value]) => ['name', 'email', 'phone', 'role'].includes(key) && value !== undefined));
    return this.prisma.eventContact.update({ where: { id }, data: input });
  }
  removeContact(id: string) { return this.prisma.eventContact.delete({ where: { id } }); }
}
