import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parsePeruDateTime } from '../../common/peru-time.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AutomationService } from '../marketing/automation.service.js';
import { MailService } from '../mail/mail.service.js';
import { RegistrationsService } from '../registrations/registrations.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class RegistrationFormsService {
  constructor(private readonly prisma: PrismaService, private readonly automations: AutomationService, private readonly mail: MailService, private readonly registrations: RegistrationsService, private readonly notifications: NotificationsService) {}

  list(eventId: string) {
    return this.prisma.registrationForm.findMany({
      where: { mainEventId: eventId },
      include: {
        fields: { orderBy: { position: 'asc' } },
        edition: { select: { id: true, name: true } },
        automations: { where: { trigger: 'REGISTRATION_SUBMITTED', status: { not: 'ARCHIVED' } }, include: { steps: { orderBy: { position: 'asc' }, include: { template: { select: { id: true, name: true, status: true } } } } } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const form = await this.prisma.registrationForm.findUnique({
      where: { id },
      include: {
        fields: { orderBy: { position: 'asc' } },
        edition: { select: { id: true, name: true } },
        mainEvent: { select: { id: true, eventName: true } },
        automations: { where: { trigger: 'REGISTRATION_SUBMITTED', status: { not: 'ARCHIVED' } }, include: { steps: { orderBy: { position: 'asc' }, include: { template: { select: { id: true, name: true, status: true } } } } } },
        _count: { select: { submissions: true } },
      },
    });
    if (!form) throw new NotFoundException('Formulario no encontrado');
    return form;
  }

  listSubmissions(eventId: string) {
    return this.prisma.registrationSubmission.findMany({
      where: { form: { mainEventId: eventId } },
      select: {
        id: true,
        email: true,
        answers: true,
        status: true,
        formId: true,
        participantId: true,
        editionId: true,
        submittedAt: true,
        form: { select: { mainEventId: true, editionId: true, title: true, purpose: true, fields: { select: { key: true, label: true, type: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async removeSubmission(id: string, actor: { accountId?: string; role?: string }) {
    const submission = await this.prisma.registrationSubmission.findUnique({ where: { id }, select: { participantId: true, form: { select: { mainEvent: { select: { organizationId: true } } } } } });
    if (!submission) throw new NotFoundException('Inscripción no encontrada');
    const isGlobalAdmin = ['SUPER_ADMIN', 'SAAS_ADMIN'].includes(actor.role || '');
    const organizationId = submission.form.mainEvent.organizationId;
    const membership = actor.accountId && organizationId ? await this.prisma.organizationMember.findFirst({ where: { organizationId, accountId: actor.accountId, role: { in: ['OWNER', 'ADMIN'] } } }) : null;
    if (!isGlobalAdmin && !membership) throw new ForbiddenException('Solo un administrador de la organización puede eliminar inscripciones.');
    return this.prisma.$transaction(async (tx) => {
      if (submission.participantId) {
        const participant = await tx.eventParticipant.findUnique({ where: { id: submission.participantId }, select: { edition: { select: { mainEventId: true } } } });
        if (participant) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-operations:${participant.edition.mainEventId}`}, 0))::text`;
      }
      if (submission.participantId) {
        if (await tx.attendanceRecord.count({ where: { participantId: submission.participantId } }) || await tx.participantCertificate.count({ where: { participantId: submission.participantId } })) throw new BadRequestException('No se puede eliminar una inscripción con historial de asistencia o certificados');
        const linked = await tx.registrationSubmission.count({ where: { participantId: submission.participantId, id: { not: id } } });
        if (!linked) await tx.eventParticipant.delete({ where: { id: submission.participantId } });
      }
      return tx.registrationSubmission.delete({ where: { id } });
    });
  }

  async create(eventId: string, data: any) {
    const purpose = data.purpose || 'PARTICIPANT';
    if (purpose === 'MAIN') {
      const mainForm = await this.prisma.registrationForm.findFirst({ where: { mainEventId: eventId, purpose: 'MAIN', status: { not: 'ARCHIVED' } } });
      if (mainForm) throw new BadRequestException('Este evento ya cuenta con un formulario de registro principal');
    }
    if (data.editionId) {
      const edition = await this.prisma.edition.findFirst({
        where: { id: data.editionId, mainEventId: eventId },
      });
      if (!edition) throw new BadRequestException('La edición seleccionada no pertenece al evento');
    }

    const fields = purpose === 'MAIN' ? await this.mainRegistrationFields(eventId, data.title) : (data.fields || []);
    return this.prisma.registrationForm.create({
      data: {
        mainEventId: eventId,
        title: data.title,
        description: data.description || null,
        slug: data.slug,
        editionId: data.editionId || null,
        status: data.status || 'DRAFT',
        opensAt: data.opensAt ? parsePeruDateTime(data.opensAt) : null,
        closesAt: data.closesAt ? parsePeruDateTime(data.closesAt) : null,
        maxSubmissions: data.maxSubmissions || null,
        approvalMode: data.approvalMode || 'MANUAL',
        purpose,
        allowEditionSelection: !!data.allowEditionSelection,
        defaultEditionId: data.defaultEditionId || null,
        thankYouMessage: data.thankYouMessage || null,
        thankYouRedirectUrl: data.thankYouRedirectUrl || null,
        fields: {
          create: fields.map((field: any, position: number) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            required: !!field.required,
            options: field.options || null,
            validation: field.validation || null,
            position,
          })),
        },
      },
      include: { fields: true },
    });
  }

  async update(id: string, data: any) {
    const clean: any = { ...data };
    const fields = clean.fields;
    delete clean.fields;
    if (clean.purpose === 'MAIN') {
      const form = await this.prisma.registrationForm.findUnique({ where: { id }, select: { mainEventId: true } });
      const mainForm = form && await this.prisma.registrationForm.findFirst({ where: { mainEventId: form.mainEventId, purpose: 'MAIN', status: { not: 'ARCHIVED' }, id: { not: id } } });
      if (mainForm) throw new BadRequestException('Este evento ya cuenta con un formulario de registro principal');
    }
    if (clean.opensAt !== undefined && clean.opensAt !== null) clean.opensAt = parsePeruDateTime(clean.opensAt);
    if (clean.closesAt !== undefined && clean.closesAt !== null) clean.closesAt = parsePeruDateTime(clean.closesAt);
    if (clean.opensAt instanceof Date && Number.isNaN(clean.opensAt.getTime())) throw new BadRequestException('La fecha de apertura no es válida');
    if (clean.closesAt instanceof Date && Number.isNaN(clean.closesAt.getTime())) throw new BadRequestException('La fecha de cierre no es válida');
    if (clean.opensAt instanceof Date && clean.closesAt instanceof Date && clean.opensAt >= clean.closesAt) {
      throw new BadRequestException('La fecha de cierre debe ser posterior a la fecha de apertura');
    }
    return this.prisma.$transaction(async (tx) => {
      if (Array.isArray(fields)) {
        await tx.registrationFormField.deleteMany({ where: { formId: id } });
        clean.fields = {
          create: fields.map((field: any, position: number) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            required: !!field.required,
            options: field.options || null,
            validation: field.validation || null,
            position,
          })),
        };
      }
      return tx.registrationForm.update({
        where: { id },
        data: clean,
        include: {
          fields: { orderBy: { position: 'asc' } },
          edition: { select: { id: true, name: true } },
          _count: { select: { submissions: true } },
        },
      });
    });
  }

  async remove(id: string) {
    const uses = await this.prisma.registrationSubmission.count({ where: { formId: id } });
    if (uses) throw new BadRequestException('No se puede eliminar un formulario con envíos; archívalo en su lugar.');
    return this.prisma.registrationForm.delete({ where: { id } });
  }

  async publicForm(slug: string) {
    const form = await this.prisma.registrationForm.findUnique({
      where: { slug },
      include: {
        fields: { orderBy: { position: 'asc' } },
        mainEvent: { select: { id: true, eventName: true, startDate: true, organizationId: true, whatsappCommunityUrl: true, organization: { select: { name: true, logoUrl: true } } } },
        edition: { select: { name: true, startDate: true } },
      },
    });
    if (!form) throw new NotFoundException('Formulario no encontrado');
    if (form.status !== 'PUBLISHED') throw new BadRequestException('Este formulario no está disponible');
    const now = new Date();
    if ((form.opensAt && now < form.opensAt) || (form.closesAt && now > form.closesAt)) {
      throw new BadRequestException('Este formulario no está disponible en este momento');
    }
    return form;
  }

  async emailAvailability(slug: string, rawEmail: string) {
    const form = await this.publicForm(slug);
    const email = rawEmail.trim().toLowerCase();
    if (!email) return { available: false };
    const existing = await this.prisma.registrationSubmission.findUnique({
      where: { formId_email: { formId: form.id, email } },
      select: { id: true },
    });
    return { available: !existing };
  }

  async submit(slug: string, answers: Record<string, unknown>, editionId?: string) {
    const form = await this.publicForm(slug);
    for (const field of form.fields) {
      if (field.required && (answers[field.key] === undefined || answers[field.key] === null || (typeof answers[field.key] === 'string' && !String(answers[field.key]).trim()))) {
        throw new BadRequestException(`El campo ${field.label} es obligatorio`);
      }
    }
    const emailField = form.fields.find((field: any) => field.type === 'email' || field.key === 'email');
    const emailValue = emailField ? answers[emailField.key] : answers.email;
    const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Correo electrónico inválido');
    const requestedEditionId = editionId || form.editionId || form.defaultEditionId || undefined;
    if (requestedEditionId && !await this.prisma.edition.findFirst({ where: { id: requestedEditionId, mainEventId: form.mainEventId }, select: { id: true } })) throw new BadRequestException('La edición no pertenece al evento');
    if (editionId && !form.allowEditionSelection && editionId !== (form.editionId || form.defaultEditionId)) throw new BadRequestException('Este formulario no permite elegir otra edición');
    if (email) {
      const existing = await this.prisma.registrationSubmission.findUnique({
        where: { formId_email: { formId: form.id, email } },
        select: { id: true },
      });
      if (existing) throw new BadRequestException('Este correo ya está registrado en este formulario');
    }
    let submission;
    let registered: { participantId: string; status: string; accessToken: string; reviewId: string | null } | undefined;
    try {
      submission = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`registration-form:${form.id}`}, 0))::text`;
        const count = await tx.registrationSubmission.count({ where: { formId: form.id } });
        if (form.maxSubmissions && count >= form.maxSubmissions) throw new BadRequestException('Se alcanzó el límite de registros');
        const registration = form.purpose === 'MAIN' ? await this.registerMainParticipant(tx, form, answers, requestedEditionId) : undefined;
        if (registration) registered = registration;
        return tx.registrationSubmission.create({
        data: {
          formId: form.id,
          editionId: registration?.editionId || requestedEditionId || null,
          participantId: registration?.participantId,
          profileId: registration?.profileId,
          answers: answers as Prisma.InputJsonValue,
          email,
          status: form.approvalMode === 'AUTOMATIC' ? 'APPROVED' : 'PENDING',
        },
        });
      }, { timeout: 20_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Este correo ya está registrado en este formulario');
      }
      throw error;
    }
    const firstName = [answers.first_name, answers.firstName, answers.name, answers.nombres, answers.nombres_completos].find((value) => typeof value === 'string') as string | undefined;
    const lastName = [answers.last_name, answers.lastName, answers.apellidos].find((value) => typeof value === 'string') as string | undefined;
    await this.automations.enrollRegistration({ eventId: form.mainEventId, registrationFormId: form.id, editionId: editionId || form.editionId || form.defaultEditionId || undefined, submissionId: submission.id, email, firstName, lastName, registeredAt: submission.submittedAt });
    const hasWelcomeTemplate = await this.prisma.marketingAutomation.count({ where: { registrationFormId: form.id, trigger: 'REGISTRATION_SUBMITTED', status: 'ACTIVE', steps: { some: { templateId: { not: null } } } } });
    if (registered) {
      // Una plantilla de bienvenida activa ya confirma por correo; los recordatorios se programan igual.
      await this.registrations.afterCommit(registered.participantId, { notify: !hasWelcomeTemplate });
      if (hasWelcomeTemplate) await this.notifications.scheduleForParticipant(registered.participantId, { skipImmediate: true });
    } else if (email && form.mainEvent.organizationId && !hasWelcomeTemplate) {
      const scheduledAt = form.edition?.startDate || form.mainEvent.startDate;
      void this.mail.sendNotification(email, {
        recipientName: firstName,
        title: `Registro recibido · ${form.mainEvent.eventName}`,
        message: `Recibimos tu registro en «${form.title}».`,
        details: [{ label: 'Evento', value: form.mainEvent.eventName }, { label: 'Fecha', value: `${scheduledAt.toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' })} (hora de Perú)` }],
      }, form.mainEvent.organizationId);
    }
    return { ...submission, mainEventId: form.mainEventId, thankYouMessage: form.thankYouMessage, thankYouRedirectUrl: form.thankYouRedirectUrl, registration: registered ? { status: registered.status, accessToken: registered.accessToken, needsReview: !!registered.reviewId } : null };
  }

  async makeMain(id: string) {
    const form = await this.prisma.registrationForm.findUnique({ where: { id } });
    if (!form) throw new NotFoundException('Formulario no encontrado');
    const existing = await this.prisma.registrationForm.findFirst({ where: { mainEventId: form.mainEventId, purpose: 'MAIN', status: { not: 'ARCHIVED' }, id: { not: id } } });
    if (existing) throw new BadRequestException('Ya existe otro formulario principal activo para este evento');
    const fields = await this.mainRegistrationFields(form.mainEventId, form.title);
    return this.prisma.$transaction(async (tx) => {
      await tx.registrationFormField.deleteMany({ where: { formId: id } });
      return tx.registrationForm.update({ where: { id }, data: { purpose: 'MAIN', fields: { create: fields.map((field, position) => ({ ...field, options: field.options || null, position })) } }, include: { fields: { orderBy: { position: 'asc' } } } });
    });
  }

  setWelcomeTemplate(formId: string, templateId?: string | null) {
    return this.automations.setWelcomeTemplate(formId, templateId);
  }

  private async mainRegistrationFields(eventId: string, title: string) {
    return [
      { key: 'header_title', label: title, type: 'header', required: false, options: { text: title } },
      { key: 'first_name', label: 'Nombres', type: 'text', required: true, options: { helpText: 'Nombres completos del participante.' } },
      { key: 'last_name', label: 'Apellidos', type: 'text', required: true, options: { helpText: 'Apellidos completos del participante.' } },
      { key: 'email', label: 'Correo Electrónico', type: 'email', required: true, options: { helpText: 'Dirección de correo electrónico única del participante.' } },
      { key: 'document_type', label: 'Identificación', type: 'select', required: false, options: ['Ninguno', 'DNI', 'CE', 'RUC', 'Otros'] },
      { key: 'document_number', label: 'Número de identificación', type: 'text', required: false, options: { helpText: 'Tipo y número del documento nacional de identidad.' } },
    ];
  }

  private async registerMainParticipant(tx: Prisma.TransactionClient, form: any, answers: Record<string, unknown>, requestedEditionId?: string) {
    const emailField = form.fields?.find((field: any) => field.type === 'email' || field.key === 'email');
    const emailValue = emailField ? answers[emailField.key] : answers.email;
    const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : '';
    if (!email) throw new BadRequestException('El correo electrónico es obligatorio');
    const fullName = String(answers.full_name || answers.name || '').trim();
    const firstName = String(answers.first_name || answers.firstName || answers.nombres || answers.nombres_completos || fullName.split(/\s+/)[0] || 'Participante').trim();
    const lastName = String(answers.last_name || answers.lastName || answers.apellidos || answers.surname || fullName.split(/\s+/).slice(1).join(' ')).trim().split(/\s+/).filter(Boolean).join(' ');
    const result = await this.registrations.register(tx, {
      eventId: form.mainEventId,
      editionId: requestedEditionId || form.editionId || null,
      origin: 'FORM',
      reviewConflicts: true,
      createEditionIfMissing: true,
      person: { firstName, lastName, email, phone: typeof answers.phone === 'string' ? answers.phone : undefined, identityDocumentType: String(answers.document_type || '') || null, identityDocumentNumber: String(answers.document_number || '') || null },
    });
    return { participantId: result.participant.id, profileId: result.profile.id, editionId: result.edition.id, status: result.participant.status, accessToken: result.participant.accessToken, reviewId: result.review?.id ?? null };
  }
}
