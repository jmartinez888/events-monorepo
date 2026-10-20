import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { blocksToHtml, interpolate } from './email-renderer.js';
import { EmailTrackingService } from './email-tracking.service.js';

const MAX_DELIVERY_ATTEMPTS = 3;

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private dispatcher?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly mail: MailService, private readonly tracking: EmailTrackingService) { }

  onModuleInit() {
    this.dispatcher = setInterval(() => void this.dispatchDue().catch((error) => this.logger.error('No se pudo procesar la cola de marketing', error)), 60_000);
  }
  onModuleDestroy() { if (this.dispatcher) clearInterval(this.dispatcher); }

  list(organizationId: string) {
    return this.prisma.marketingAutomation.findMany({ where: { organizationId }, include: { steps: { orderBy: { position: 'asc' }, include: { template: { select: { id: true, name: true, subject: true, status: true } } } }, event: { select: { id: true, eventName: true, startDate: true } }, registrationForm: { select: { id: true, title: true, slug: true } }, _count: { select: { steps: true, enrollments: true } } }, orderBy: { updatedAt: 'desc' } });
  }

  async create(organizationId: string, data: any) {
    if (data.eventId) await this.assertEvent(organizationId, data.eventId);
    const form = data.registrationFormId ? await this.assertForm(organizationId, data.registrationFormId) : null;
    if (form && data.eventId && form.mainEventId !== data.eventId) throw new BadRequestException('El formulario no pertenece al evento seleccionado');
    this.assertOperationalDefinition(data);
    await this.assertTemplates(organizationId, data.steps);
    return this.prisma.marketingAutomation.create({ data: { organizationId, eventId: data.eventId || form?.mainEventId || null, registrationFormId: data.registrationFormId || null, trigger: data.trigger || 'REGISTRATION_SUBMITTED', name: data.name, status: data.status || 'DRAFT', settings: data.settings || null, steps: { create: this.steps(data.steps) } }, include: { steps: { orderBy: { position: 'asc' }, include: { template: true } }, event: true, registrationForm: true } });
  }

  async update(id: string, data: any, actor?: { accountId?: string; role?: string }) {
    const current = await this.prisma.marketingAutomation.findUnique({ where: { id }, include: { steps: true } });
    if (!current) throw new NotFoundException('Automatización no encontrada');
    await this.assertManager(current.organizationId, actor);
    if (data.eventId) await this.assertEvent(current.organizationId, data.eventId);
    const form = data.registrationFormId ? await this.assertForm(current.organizationId, data.registrationFormId) : null;
    if (form && data.eventId && form.mainEventId !== data.eventId) throw new BadRequestException('El formulario no pertenece al evento seleccionado');
    this.assertOperationalDefinition({ ...current, ...data });
    if (Array.isArray(data.steps)) await this.assertTemplates(current.organizationId, data.steps);
    return this.prisma.$transaction(async (tx) => {
      if (Array.isArray(data.steps)) await tx.marketingAutomationStep.deleteMany({ where: { automationId: id } });
      return tx.marketingAutomation.update({ where: { id }, data: { name: data.name, status: data.status, eventId: data.eventId === undefined ? undefined : (data.eventId || form?.mainEventId || null), registrationFormId: data.registrationFormId === undefined ? undefined : (data.registrationFormId || null), trigger: data.trigger, settings: data.settings, ...(Array.isArray(data.steps) ? { steps: { create: this.steps(data.steps) } } : {}) }, include: { steps: { orderBy: { position: 'asc' }, include: { template: true } }, registrationForm: true } });
    });
  }

  async remove(id: string, actor: { accountId?: string; role?: string }) {
    const automation = await this.prisma.marketingAutomation.findUnique({ where: { id }, select: { id: true, organizationId: true } });
    if (!automation) throw new NotFoundException('Automatización no encontrada');
    await this.assertManager(automation.organizationId, actor);
    await this.prisma.marketingAutomation.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertManager(organizationId: string, actor?: { accountId?: string; role?: string }) {
    if (['SUPER_ADMIN', 'SAAS_ADMIN'].includes(actor?.role || '')) return;
    const membership = actor?.accountId ? await this.prisma.organizationMember.findFirst({ where: { organizationId, accountId: actor.accountId, role: { in: ['OWNER', 'ADMIN'] } } }) : null;
    if (!membership) throw new ForbiddenException('Solo un administrador de esta institución puede gestionar la automatización.');
  }

  /** Configura la bienvenida de un formulario sin duplicar la plantilla. */
  async setWelcomeTemplate(formId: string, templateId?: string | null) {
    const form = await this.prisma.registrationForm.findUnique({ where: { id: formId }, include: { mainEvent: { select: { organizationId: true } } } });
    if (!form?.mainEvent.organizationId) throw new NotFoundException('Formulario o institución no encontrados');
    const organizationId = form.mainEvent.organizationId;
    const trigger = 'REGISTRATION_SUBMITTED';
    if (!templateId) {
      const existing = await this.prisma.marketingAutomation.findUnique({ where: { registrationFormId_trigger: { registrationFormId: form.id, trigger } } });
      if (existing) await this.prisma.marketingAutomation.update({ where: { id: existing.id }, data: { status: 'ARCHIVED' } });
      return { templateId: null, automationId: existing?.id || null, status: 'ARCHIVED' };
    }
    const template = await this.prisma.emailTemplate.findFirst({ where: { id: templateId, organizationId, status: { not: 'ARCHIVED' } }, select: { id: true, name: true, status: true } });
    if (!template) throw new BadRequestException('La plantilla debe pertenecer a la institución y no puede estar archivada');
    // Elegirla explícitamente para una comunicación transaccional autoriza su activación.
    if (template.status !== 'ACTIVE') await this.prisma.emailTemplate.update({ where: { id: template.id }, data: { status: 'ACTIVE' } });
    const existing = await this.prisma.marketingAutomation.findUnique({ where: { registrationFormId_trigger: { registrationFormId: form.id, trigger } } });
    const data = { organizationId, eventId: form.mainEventId, registrationFormId: form.id, trigger, name: `Bienvenida · ${form.title}`, status: 'ACTIVE' as const };
    const automation = existing
      ? await this.prisma.$transaction(async (tx) => { await tx.marketingAutomationStep.deleteMany({ where: { automationId: existing.id } }); return tx.marketingAutomation.update({ where: { id: existing.id }, data: { ...data, steps: { create: this.steps([{ timing: 'IMMEDIATE', templateId: template.id }]) } }, include: { steps: { include: { template: true } } } }); })
      : await this.prisma.marketingAutomation.create({ data: { ...data, steps: { create: this.steps([{ timing: 'IMMEDIATE', templateId: template.id }]) } }, include: { steps: { include: { template: true } } } });
    return { templateId: template.id, automationId: automation.id, status: automation.status };
  }

  /** Enrola una inscripción sólo en automatizaciones activas de su evento. */
  async enrollRegistration(input: { eventId: string; registrationFormId?: string; editionId?: string; submissionId: string; email?: string | null; firstName?: string | null; lastName?: string | null; registeredAt?: Date }) {
    const email = String(input.email || '').trim().toLowerCase();
    if (!email) return { enrolled: 0, reason: 'La inscripción no tiene correo' };
    const event = await this.prisma.mainEvent.findUnique({ where: { id: input.eventId }, select: { id: true, organizationId: true, eventName: true, startDate: true, venueAddress: true } });
    if (!event?.organizationId) return { enrolled: 0, reason: 'El evento no tiene institución' };
    const edition = input.editionId
      ? await this.prisma.edition.findFirst({ where: { id: input.editionId, mainEventId: event.id }, select: { name: true, startDate: true } })
      : null;
    const scheduledAt = edition?.startDate || event.startDate;
    const contact = await this.prisma.marketingContact.upsert({ where: { organizationId_emailFallback: { organizationId: event.organizationId, emailFallback: email } }, update: { source: 'EVENT_REGISTRATION' }, create: { organizationId: event.organizationId, emailFallback: email, consentStatus: 'SUBSCRIBED', consentedAt: new Date(), source: 'EVENT_REGISTRATION' } });
    // Una automatización vinculada explícitamente al formulario tiene prioridad.
    // Así, una campaña general del evento no puede enviar su correo genérico junto
    // con la plantilla que el administrador escogió al publicar el formulario.
    const formAutomations = input.registrationFormId
      ? await this.prisma.marketingAutomation.findMany({
        where: { organizationId: event.organizationId, eventId: event.id, registrationFormId: input.registrationFormId, status: 'ACTIVE' },
        include: { steps: { orderBy: { position: 'asc' } } },
      })
      : [];
    const automations = formAutomations.length
      ? formAutomations
      : await this.prisma.marketingAutomation.findMany({
        where: { organizationId: event.organizationId, eventId: event.id, registrationFormId: null, status: 'ACTIVE' },
        include: { steps: { orderBy: { position: 'asc' } } },
      });
    let enrolled = 0;
    for (const automation of automations) {
      await this.prisma.marketingEventEnrollment.upsert({ where: { automationId_contactId: { automationId: automation.id, contactId: contact.id } }, update: { submissionId: input.submissionId, firstName: input.firstName || null, registeredAt: input.registeredAt || new Date(), attendanceStatus: 'REGISTERED' }, create: { organizationId: event.organizationId, eventId: event.id, automationId: automation.id, contactId: contact.id, submissionId: input.submissionId, firstName: input.firstName || null, registeredAt: input.registeredAt || new Date() } });
      await this.queueContact(automation, contact, event, input.firstName || null, input.registeredAt || new Date(), { last_name: input.lastName || '', registration_code: input.submissionId, event_start_date: scheduledAt.toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' }), edition_name: edition?.name || '', edition_start_date: edition?.startDate ? edition.startDate.toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' }) : '' });
      enrolled++;
    }
    return { enrolled };
  }

  /** La cola ahora usa exclusivamente inscritos del evento. */
  async queue(id: string) {
    const automation = await this.prisma.marketingAutomation.findUnique({ where: { id }, include: { event: true, steps: { orderBy: { position: 'asc' } }, enrollments: { include: { contact: true } } } });
    if (!automation) throw new NotFoundException('Automatización no encontrada');
    if (!automation.event) throw new BadRequestException('La automatización requiere un evento');
    let queued = 0;
    for (const enrollment of automation.enrollments) {
      if (enrollment.contact.consentStatus !== 'SUBSCRIBED' || !enrollment.contact.emailFallback || enrollment.purchaseStatus === 'PURCHASED' || enrollment.benefitUsedAt) continue;
      queued += await this.queueContact(automation, enrollment.contact, automation.event, enrollment.firstName, enrollment.registeredAt);
    }
    return { queued };
  }

  /** Incorpora inscripciones previas de forma explícita; conserva la regla de no enviar pasos vencidos. */
  async enrollExisting(id: string) {
    const automation = await this.prisma.marketingAutomation.findUnique({ where: { id }, include: { event: true } });
    if (!automation?.eventId || !automation.event) throw new BadRequestException('La campaña requiere un evento');
    const submissions = await this.prisma.registrationSubmission.findMany({
      where: { form: { mainEventId: automation.eventId }, ...(automation.registrationFormId ? { formId: automation.registrationFormId } : {}), email: { not: null } },
      orderBy: { submittedAt: 'asc' },
    });
    let enrolled = 0;
    for (const submission of submissions) {
      const answers = (submission.answers as Record<string, unknown>) || {};
      const firstName = [answers.first_name, answers.firstName, answers.name, answers.nombres].find((value) => typeof value === 'string') as string | undefined;
      const lastName = [answers.last_name, answers.lastName, answers.apellidos].find((value) => typeof value === 'string') as string | undefined;
      const result = await this.enrollRegistration({ eventId: automation.eventId, registrationFormId: submission.formId, editionId: submission.editionId || undefined, submissionId: submission.id, email: submission.email, firstName, lastName, registeredAt: submission.submittedAt });
      enrolled += result.enrolled;
    }
    return { enrolled, scanned: submissions.length };
  }

  async dispatchDue(limit = 100) {
    // Reclamación atómica: varias instancias no envían el mismo correo. Un bloqueo de más de
    // 10 minutos se considera abandonado (proceso caído) y se vuelve a reclamar.
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE email_deliveries SET locked_at = now(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM email_deliveries
        WHERE status = 'QUEUED' AND scheduled_at <= now() AND (locked_at IS NULL OR locked_at < now() - interval '10 minutes')
        ORDER BY scheduled_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    const jobs = claimed.length ? await this.prisma.emailDelivery.findMany({ where: { id: { in: claimed.map((item) => item.id) } }, orderBy: { scheduledAt: 'asc' } }) : [];
    let sent = 0; let failed = 0; let skipped = 0;
    for (const job of jobs) {
      if (!job.stepId || !job.automationId) { await this.prisma.emailDelivery.update({ where: { id: job.id }, data: { status: 'SKIPPED', error: 'Entrega sin automatización asociada', lockedAt: null } }); skipped++; continue; }
      const step = await this.prisma.marketingAutomationStep.findUnique({ where: { id: job.stepId } });
      const enrollment = job.contactId ? await this.prisma.marketingEventEnrollment.findUnique({ where: { automationId_contactId: { automationId: job.automationId, contactId: job.contactId } } }) : null;
      const contact = job.contactId ? await this.prisma.marketingContact.findUnique({ where: { id: job.contactId }, select: { consentStatus: true } }) : null;
      if (!step || contact?.consentStatus === 'UNSUBSCRIBED' || enrollment?.purchaseStatus === 'PURCHASED' || enrollment?.benefitUsedAt) { await this.prisma.emailDelivery.update({ where: { id: job.id }, data: { status: 'SKIPPED', error: 'No cumple las condiciones de envío', lockedAt: null } }); skipped++; continue; }
      const template = step.templateId ? await this.prisma.emailTemplate.findUnique({ where: { id: step.templateId } }) : null;
      const context = (job.context as Record<string, unknown> | null) || {};
      const subject = interpolate(step.subject || template?.subject || 'Información importante', context);
      const configuredHtml = step.htmlContent ? interpolate(step.htmlContent, context) : template?.htmlContent ? interpolate(template.htmlContent, context) : blocksToHtml(template?.content, context);
      const html = this.tracking.decorateHtml(configuredHtml?.trim() ? configuredHtml : this.registrationFallbackHtml(context), job.trackingToken);
      const result = await this.mail.send({ to: job.recipientEmail, subject, html, organizationId: job.organizationId });
      // Fallos transitorios se reintentan con espera creciente; al tercer intento quedan en FAILED.
      const retry = !result.sent && job.attempts < MAX_DELIVERY_ATTEMPTS;
      await this.prisma.emailDelivery.update({ where: { id: job.id }, data: result.sent ? { status: 'SENT', sentAt: new Date(), providerMessageId: result.messageId, lockedAt: null, error: null } : retry ? { error: result.reason, lockedAt: null, scheduledAt: new Date(Date.now() + 2 ** job.attempts * 5 * 60_000) } : { status: 'FAILED', error: result.reason, lockedAt: null } });
      result.sent ? sent++ : failed++;
    }
    return { processed: jobs.length, sent, failed, skipped };
  }

  async analytics(organizationId: string) { return this.tracking.analytics(organizationId); }

  private async queueContact(automation: any, contact: any, event: any, firstName: string | null, registeredAt: Date, extraContext: Record<string, unknown> = {}) {
    if (contact.consentStatus !== 'SUBSCRIBED' || !contact.emailFallback) return 0;
    const settings = (automation.settings as Record<string, unknown> | null) || {};
    const values = { first_name: firstName || 'amigo', last_name: '', email: contact.emailFallback, event_name: event.eventName, event_start_date: event.startDate.toISOString(), event_location: event.venueAddress || '', edition_name: '', edition_start_date: '', registration_code: '', whatsapp_community_url: '', offer_url: '', discount_code: '', unsubscribe_url: '', ...settings, ...extraContext };
    const context = {
      ...values,
      contact: { first_name: values.first_name, last_name: values.last_name, email: values.email },
      event: { name: values.event_name, start_date: values.event_start_date, location: values.event_location },
      edition: { name: values.edition_name, start_date: values.edition_start_date },
      registration: { code: values.registration_code },
      automation: { whatsapp_community_url: values.whatsapp_community_url, offer_url: values.offer_url, discount_code: values.discount_code, unsubscribe_url: values.unsubscribe_url },
    };
    let queued = 0;
    for (const step of automation.steps) {
      const date = this.when(step, event.startDate, registeredAt, new Date());
      if (!date) continue;
      const delivery = await this.prisma.emailDelivery.upsert({ where: { stepId_recipientEmail: { stepId: step.id, recipientEmail: contact.emailFallback } }, update: {}, create: { organizationId: automation.organizationId, automationId: automation.id, stepId: step.id, contactId: contact.id, recipientEmail: contact.emailFallback, recipientName: firstName, scheduledAt: date, context: context as any } });
      const unsubscribeUrl = this.tracking.unsubscribeUrl(delivery.trackingToken);
      const enrichedContext = { ...context, unsubscribe_url: unsubscribeUrl, automation: { ...context.automation, unsubscribe_url: unsubscribeUrl } };
      await this.prisma.emailDelivery.update({ where: { id: delivery.id }, data: { context: enrichedContext as any } });
      if (delivery.status === 'QUEUED') queued++;
    }
    return queued;
  }

  private when(step: any, eventStart: Date, registeredAt: Date, now: Date) {
    if (step.timing === 'IMMEDIATE') return registeredAt > now ? registeredAt : now;
    const date = step.timing === 'BEFORE_EVENT' ? new Date(eventStart.getTime() - step.offsetHours * 3600000) : step.timing === 'AFTER_EVENT' ? new Date(eventStart.getTime() + step.offsetHours * 3600000) : new Date(registeredAt.getTime() + step.offsetHours * 3600000);
    return date <= now ? null : date;
  }
  private registrationFallbackHtml(context: Record<string, unknown>) {
    const name = String(context.first_name || 'participante');
    const eventName = String(context.event_name || 'nuestro webinar');
    const logo = '<img src="https://medmind.com.pe/assets/brands/logo_medmind.svg" alt="MedMind" width="150" style="display:block;width:150px;height:auto;margin:0 auto;filter:brightness(0) invert(1)"/>';
    return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f5;font-family:Arial,Helvetica,sans-serif;color:#4b4b4b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f5f5"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="750" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:750px;background:#ffffff"><tr><td align="center" style="background:#16b8aa;padding:25px">${logo}</td></tr><tr><td style="padding:44px 50px;font-size:18px;line-height:1.7"><h1 style="margin:0 0 24px;color:#303030;font-size:26px;line-height:1.2">¡Hola, ${name} 👋!</h1><p style="margin:0 0 22px">Tu registro para nuestro <strong>${eventName}</strong> está confirmado.</p><p style="margin:0 0 22px">Si tienes <strong>menos de 13 puntos en tu CV</strong>, durante este webinar hablaremos de cómo puedes construir desde ahora una estrategia de ingreso más inteligente, cuándo podría tener sentido volver a rendir el ENAM y cómo hacerlo <strong>sin detener tu preparación para el Residentado</strong>.</p><h2 style="margin:40px 0 16px;color:#303030;font-size:21px;line-height:1.3">Ahora solo falta un paso 👇</h2><p style="margin:0 0 12px">Únete a nuestra <strong>Comunidad Exclusiva RM 2027</strong>. Por ahí compartiremos el link de acceso, recordatorios e información importante de la sesión.</p><p style="margin:28px 0 0">Nos vemos dentro 🧠.</p><p style="margin:8px 0 0"><strong>Equipo MedMind</strong></p></td></tr></table></td></tr></table></body></html>`;
  }
  private steps(steps: any[] = []) { return steps.map((step, index) => ({ position: index + 1, timing: step.timing, offsetHours: Number(step.offsetHours || 0), templateId: step.templateId || null, subject: step.subject || null, htmlContent: step.htmlContent || null, conditions: step.conditions || null })); }
  private assertOperationalDefinition(data: any) {
    if (!String(data.name || '').trim()) throw new BadRequestException('La campaña necesita un nombre');
    if (data.status === 'ACTIVE') {
      if (!data.eventId) throw new BadRequestException('Selecciona el webinar o evento para activar la campaña');
      if (!Array.isArray(data.steps) || data.steps.length === 0) throw new BadRequestException('Agrega al menos un correo antes de activar la campaña');
      if (data.steps.some((step: any) => !step.templateId && !String(step.htmlContent || '').trim())) throw new BadRequestException('Cada paso activo necesita una plantilla o contenido de correo');
    }
  }
  private async assertEvent(organizationId: string, eventId: string) { const event = await this.prisma.mainEvent.findFirst({ where: { id: eventId, organizationId } }); if (!event) throw new BadRequestException('El evento no pertenece a la institución'); }
  private async assertForm(organizationId: string, formId: string) { const form = await this.prisma.registrationForm.findFirst({ where: { id: formId, mainEvent: { organizationId } } }); if (!form) throw new BadRequestException('El formulario no pertenece a la institución'); return form; }
  private async assertTemplates(organizationId: string, steps: any[] | undefined) { const ids = [...new Set((steps || []).map((step) => step.templateId).filter(Boolean))]; if (!ids.length) return; const count = await this.prisma.emailTemplate.count({ where: { id: { in: ids }, organizationId } }); if (count !== ids.length) throw new BadRequestException('Una o más plantillas no pertenecen a la institución'); }
}
