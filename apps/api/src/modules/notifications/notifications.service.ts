import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { TelegramClient } from '../integrations/providers/telegram.client.js';
import { config } from '../../common/config.js';
import { randomUUID } from 'node:crypto';

const MAX_ATTEMPTS = 4;
const STALE_MINUTES = 10;

interface ClaimedNotification { id: string; attempts: number }

export type NotificationType = 'CONFIRMATION' | 'WAITLISTED' | 'WAITLIST_PROMOTED' | 'REMINDER' | 'CERTIFICATE';

/** Fecha y hora en Iquitos/Lima. */
export const limaDate = (date: Date) => date.toLocaleString('es-PE', { dateStyle: 'full', timeStyle: 'short', timeZone: config.timezone });

/**
 * Confirmaciones y recordatorios (flujo 07). Cada aviso es una fila con clave de
 * idempotencia; el despachador reclama filas con SKIP LOCKED, así varias
 * instancias no envían el mismo aviso. Telegram con respaldo por correo.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService, private readonly telegram: TelegramClient) {}

  onModuleInit() {
    if (process.env.NOTIFICATIONS_WORKER === 'false') return;
    this.timer = setInterval(() => void this.dispatchDue().catch((error) => this.logger.error('Fallo despachando notificaciones', error)), Number(process.env.NOTIFICATIONS_WORKER_INTERVAL_MS || 30_000));
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Programa la confirmación y los recordatorios de una inscripción. Repetirlo no duplica avisos. */
  async scheduleForParticipant(participantId: string, options: { type?: NotificationType; skipImmediate?: boolean } = {}) {
    const participant = await this.prisma.eventParticipant.findUnique({
      where: { id: participantId },
      include: { edition: { include: { mainEvent: true, activities: { include: { sessions: true } } } } },
    });
    if (!participant || participant.status === 'CANCELLED') return { scheduled: 0, reminderKeys: [] as string[] };
    const event = participant.edition.mainEvent;
    const now = new Date();
    const rows: Prisma.NotificationCreateManyInput[] = [];
    const base = { profileId: participant.profileId, participantId, mainEventId: event.id };

    const immediate: NotificationType = options.type ?? (participant.status === 'WAITLISTED' ? 'WAITLISTED' : 'CONFIRMATION');
    if (!options.skipImmediate) rows.push({ ...base, type: immediate, scheduledFor: now, idempotencyKey: `${participantId}:${immediate}` });

    if (participant.status === 'CONFIRMED') {
      const sessions = participant.edition.activities.flatMap((activity) => activity.sessions).filter((session) => session.startsAt);
      const targets = sessions.length
        ? sessions.map((session) => ({ sessionId: session.id as string | null, startsAt: session.startsAt! }))
        : [{ sessionId: null, startsAt: participant.edition.startDate ?? event.startDate }];
      for (const target of targets) {
        for (const offset of event.reminderOffsets ?? []) {
          const scheduledFor = new Date(target.startsAt.getTime() - offset * 60_000);
          if (scheduledFor <= now) continue;
          // La hora de inicio forma parte de la clave: si la sesión cambia de hora, nace un aviso nuevo.
          rows.push({ ...base, sessionId: target.sessionId, type: 'REMINDER', scheduledFor, idempotencyKey: `${participantId}:REMINDER:${target.sessionId ?? 'event'}:${offset}:${target.startsAt.toISOString()}` });
        }
      }
    }
    const result = await this.prisma.notification.createMany({ data: rows, skipDuplicates: true });
    return { scheduled: result.count, reminderKeys: rows.filter((row) => row.type === 'REMINDER').map((row) => row.idempotencyKey) };
  }

  /** Tras cambiar horarios o momentos de recordatorio: anula lo obsoleto y reprograma. */
  async rescheduleEvent(eventId: string) {
    await this.prisma.notification.updateMany({ where: { mainEventId: eventId, type: 'REMINDER', status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
    const participants = await this.prisma.eventParticipant.findMany({ where: { edition: { mainEventId: eventId }, status: 'CONFIRMED' }, select: { id: true } });
    for (const participant of participants) await this.schedulePendingReminders(participant.id);
    return { participants: participants.length };
  }

  private async schedulePendingReminders(participantId: string) {
    // Reprogramar no reenvía la confirmación: createMany la omite por su clave.
    const { reminderKeys } = await this.scheduleForParticipant(participantId);
    // Solo vuelven los recordatorios cuyo horario sigue vigente; los de horas antiguas quedan anulados.
    if (reminderKeys.length) await this.prisma.notification.updateMany({ where: { participantId, idempotencyKey: { in: reminderKeys }, status: 'CANCELLED' }, data: { status: 'SCHEDULED' } });
  }

  async cancelForParticipant(participantId: string) {
    await this.prisma.notification.updateMany({ where: { participantId, status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
  }

  async notifyCertificate(certificateId: string) {
    const certificate = await this.prisma.participantCertificate.findUnique({ where: { id: certificateId }, include: { participant: { include: { edition: true } } } });
    if (!certificate) return;
    await this.prisma.notification.createMany({
      data: [{ profileId: certificate.participant.profileId, participantId: certificate.participantId, mainEventId: certificate.participant.edition.mainEventId, type: 'CERTIFICATE', scheduledFor: new Date(), idempotencyKey: `certificate:${certificateId}` }],
      skipDuplicates: true,
    });
  }

  async preferenceFor(profileId: string) {
    return this.prisma.notificationPreference.upsert({ where: { profileId }, create: { profileId }, update: {} });
  }

  async updatePreference(profileId: string, data: { channel?: NotificationChannel; remindersEnabled?: boolean }) {
    const current = await this.preferenceFor(profileId);
    // Telegram solo se puede elegir tras enlazar el bot; si no, el aviso caería al correo igualmente.
    const channel = data.channel === 'TELEGRAM' && !current.telegramChatId ? undefined : data.channel;
    return this.prisma.notificationPreference.update({ where: { profileId }, data: { channel, remindersEnabled: data.remindersEnabled } });
  }

  /** Procesa /start <token> y /stop del bot. */
  async handleTelegramUpdate(update: any) {
    const message = update?.message;
    const chatId = message?.chat?.id ? String(message.chat.id) : null;
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (!chatId || !text) return { handled: false };
    const [command, argument] = text.split(/\s+/, 2);
    if (command === '/start' && argument && /^[0-9a-f-]{36}$/i.test(argument)) {
      const preference = await this.prisma.notificationPreference.findUnique({ where: { telegramLinkToken: argument } });
      if (!preference) {
        await this.telegram.sendMessage(chatId, 'El enlace no es válido o ya fue usado. Ábrelo de nuevo desde tu página de inscripción.');
        return { handled: true };
      }
      // Se rota el token: un enlace compartido no permite secuestrar el canal después.
      await this.prisma.notificationPreference.update({ where: { id: preference.id }, data: { telegramChatId: chatId, telegramLinkedAt: new Date(), channel: 'TELEGRAM', telegramLinkToken: randomUUID() } });
      await this.telegram.sendMessage(chatId, '✅ Listo. Recibirás aquí las confirmaciones y recordatorios de tus eventos. Escribe /stop para dejar de recibir recordatorios.');
      return { handled: true };
    }
    if (command === '/stop') {
      await this.prisma.notificationPreference.updateMany({ where: { telegramChatId: chatId }, data: { remindersEnabled: false } });
      await this.telegram.sendMessage(chatId, 'Recordatorios desactivados. Puedes reactivarlos desde tu página de inscripción.');
      return { handled: true };
    }
    await this.telegram.sendMessage(chatId, 'Para enlazar este chat, usa el botón de Telegram de tu página de inscripción.');
    return { handled: true };
  }

  /** Despacha los avisos vencidos. Público para ejecución manual y pruebas. */
  async dispatchDue(limit = 50) {
    if (this.running) return { processed: 0 };
    this.running = true;
    try {
      const claimed = await this.prisma.$queryRaw<ClaimedNotification[]>`
        UPDATE notifications SET status = 'SENDING', locked_at = now(), attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM notifications
          WHERE (status = 'SCHEDULED' AND scheduled_for <= now())
             OR (status = 'SENDING' AND locked_at < now() - make_interval(mins => ${STALE_MINUTES}::int))
          ORDER BY scheduled_for
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, attempts`;
      let sent = 0;
      for (const item of claimed) if (await this.deliver(item)) sent++;
      return { processed: claimed.length, sent };
    } finally {
      this.running = false;
    }
  }

  private async deliver(item: ClaimedNotification) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: item.id },
      include: {
        profile: { include: { notificationPreference: true, authUser: { select: { email: true } } } },
        participant: { include: { edition: true, sessionRegistrations: { where: { joinUrl: { not: null } }, include: { session: { select: { id: true, title: true, startsAt: true } } } } } },
        event: { include: { organization: { select: { slug: true, name: true } } } },
      },
    });
    if (!notification) return false;
    const finish = (data: Prisma.NotificationUpdateInput) => this.prisma.notification.update({ where: { id: item.id }, data: { lockedAt: null, ...data } });
    const participant = notification.participant;
    if (participant?.status === 'CANCELLED' && notification.type !== 'CERTIFICATE') { await finish({ status: 'CANCELLED' }); return false; }
    const preference = notification.profile.notificationPreference;
    if (notification.type === 'REMINDER' && preference && !preference.remindersEnabled) { await finish({ status: 'SKIPPED', lastError: 'La persona desactivó los recordatorios' }); return false; }

    const content = await this.compose(notification);
    const email = notification.profile.primaryEmail || notification.profile.authUser?.email || asStrings(notification.profile.additionalEmails)[0];
    const errors: string[] = [];

    if (preference?.channel === 'TELEGRAM' && preference.telegramChatId && this.telegram.configured) {
      try {
        await this.telegram.sendMessage(preference.telegramChatId, content.telegram);
        await finish({ status: 'SENT', channel: 'TELEGRAM', sentAt: new Date(), lastError: null });
        return true;
      } catch (error: any) {
        errors.push(`Telegram: ${error?.message ?? error}`);
      }
    }
    if (email) {
      const result = await this.sendEmail(email, notification.event.organizationId, content, `${notification.profile.firstName ?? ''} ${notification.profile.lastName ?? ''}`.trim());
      if (result.sent) {
        await finish({ status: 'SENT', channel: 'EMAIL', sentAt: new Date(), lastError: errors.join(' | ') || null });
        return true;
      }
      errors.push(`Correo: ${result.reason ?? 'no enviado'}`);
    } else errors.push('La persona no tiene un canal válido');

    // Sin canal válido no se reintenta; un fallo transitorio sí, con un tope.
    const retry = !!email && item.attempts < MAX_ATTEMPTS;
    await finish(retry
      ? { status: 'SCHEDULED', scheduledFor: new Date(Date.now() + 2 ** item.attempts * 60_000), lastError: errors.join(' | ').slice(0, 1000) }
      : { status: 'FAILED', lastError: errors.join(' | ').slice(0, 1000) });
    return false;
  }

  private async sendEmail(to: string, organizationId: string | null, content: { subject: string; title: string; message: string; actionText?: string; actionUrl?: string; details: Array<{ label: string; value: string }> }, name: string) {
    const data = { recipientName: name || undefined, title: content.title, message: content.message, actionText: content.actionText, actionUrl: content.actionUrl, details: content.details };
    const result = await this.mail.sendNotification(to, data, organizationId ?? undefined);
    // Sin configuración de correo institucional, solo se usa el proveedor global si se habilita explícitamente.
    if (!result.sent && organizationId && process.env.MAIL_SYSTEM_FALLBACK === 'true') return this.mail.sendNotification(to, data);
    return result;
  }

  private async compose(notification: any) {
    const event = notification.event;
    const participant = notification.participant;
    const portalLink = participant && event.organization ? `${config.portalUrl()}/${event.organization.slug}/inscripcion/${participant.accessToken}` : undefined;
    const sessions = participant ? await this.prisma.eventSession.findMany({ where: { activity: { editionId: participant.editionId } }, orderBy: { startsAt: 'asc' }, include: { integration: { select: { facebookLiveUrl: true } } } }) : [];
    const firstStart: Date = sessions.find((session: any) => session.startsAt)?.startsAt ?? participant?.edition?.startDate ?? event.startDate;
    const reminderSession = notification.sessionId ? sessions.find((session: any) => session.id === notification.sessionId) : null;
    const joinLinks: Array<{ label: string; value: string }> = (participant?.sessionRegistrations ?? []).filter((item: any) => !notification.sessionId || item.sessionId === notification.sessionId).map((item: any) => ({ label: `Enlace Zoom · ${item.session.title}`, value: item.joinUrl }));
    const live = sessions.find((session: any) => session.integration?.facebookLiveUrl && (!notification.sessionId || session.id === notification.sessionId))?.integration?.facebookLiveUrl;
    const place = event.eventMode === 'ONLINE' ? 'Virtual' : event.venueAddress || 'Por confirmar';
    const details = [{ label: 'Evento', value: event.eventName }, { label: 'Fecha', value: `${limaDate(reminderSession?.startsAt ?? firstStart)} (hora de Perú)` }, { label: 'Lugar', value: place }, ...joinLinks, ...(live ? [{ label: 'Transmisión en Facebook', value: live }] : [])];
    let subject: string; let title: string; let message: string;
    switch (notification.type as NotificationType) {
      case 'WAITLISTED': subject = title = `Lista de espera · ${event.eventName}`; message = 'El aforo está completo. Quedaste en lista de espera y te avisaremos si se libera un cupo.'; break;
      case 'WAITLIST_PROMOTED': subject = title = `Cupo confirmado · ${event.eventName}`; message = 'Se liberó un cupo y tu inscripción quedó confirmada.'; break;
      case 'REMINDER': subject = title = `Recordatorio · ${reminderSession?.title ?? event.eventName}`; message = `Te esperamos pronto${reminderSession ? ` en «${reminderSession.title}»` : ''}.${event.eventMode !== 'ONLINE' ? ' En la sede, tu asistencia se registra con QR.' : ''}`; break;
      case 'CERTIFICATE': subject = title = `Certificado disponible · ${event.eventName}`; message = 'Tu certificado fue emitido. Puedes consultarlo y verificarlo desde tu página de inscripción.'; break;
      default: subject = title = `Inscripción confirmada · ${event.eventName}`; message = event.eventMode === 'PHYSICAL' ? 'Tu inscripción está confirmada. El día del evento registrarás tu asistencia con QR.' : 'Tu inscripción está confirmada. Guarda tu enlace personal: es único para ti.';
    }
    const actionText = portalLink ? 'Ver mi inscripción' : undefined;
    const telegram = [`<b>${escapeHtml(title)}</b>`, escapeHtml(message), ...details.map((item) => `<b>${escapeHtml(item.label)}:</b> ${escapeHtml(item.value)}`), ...(portalLink ? [`<a href="${portalLink}">Ver mi inscripción</a>`] : [])].join('\n');
    return { subject, title, message, details, actionText, actionUrl: portalLink, telegram };
  }
}

const asStrings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
