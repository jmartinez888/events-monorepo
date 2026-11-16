import { Injectable, Logger } from '@nestjs/common';
import {
  GeneralNotificationEmailData,
  MailDeliveryResult,
  OrgInvitationEmailData,
  PasswordChangedEmailData,
  ResetPasswordEmailData,
  SendCustomMailOptions,
  SendMailOptions,
  WelcomeEmailData,
} from './mail.types.js';
import { TemplateService } from './template.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { decryptCredential } from '../../common/utils/encryption.util.js';
import nodemailer from 'nodemailer';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { config } from '../../common/config.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly templateService: TemplateService,
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) { }

  /**
   * Universal send method. If organizationId is specified, uses the organization's
   * configured credentials (Resend or Gmail/SMTP); otherwise uses the platform mail settings.
   */
  async send(options: SendMailOptions): Promise<MailDeliveryResult> {
    const toRecipients = Array.isArray(options.to) ? options.to : [options.to];

    // Las comunicaciones pertenecientes a una institución nunca deben usar
    // credenciales globales de otra institución como respaldo.
    if (options.organizationId) {
      try {
        const orgSettings = await this.prisma.organizationEmailSettings.findUnique({
          where: { organizationId: options.organizationId },
        });

        if (!orgSettings || !orgSettings.isActive) {
          return { sent: false, reason: 'La institución no tiene una configuración de correo activa.' };
        }

        const provider = orgSettings.defaultProvider || 'RESEND';

        if (provider === 'RESEND') {
          if (!orgSettings.resendApiKeyEncrypted || !orgSettings.resendFromEmail) {
            return { sent: false, reason: 'La configuración de Resend de la institución está incompleta.' };
          }
          const resendApiKey = decryptCredential(orgSettings.resendApiKeyEncrypted);
          if (!resendApiKey) {
            return { sent: false, reason: 'No se pudo leer la credencial de Resend de la institución.' };
          }
          const fromEmail = options.fromEmail || orgSettings.resendFromEmail;
          const fromName = options.fromName || orgSettings.resendFromName || 'Events Platform';

          return this.sendWithResend({
            apiKey: resendApiKey,
            fromEmail,
            fromName,
            replyTo: orgSettings.replyTo || undefined,
            to: toRecipients,
            subject: options.subject,
            html: options.html,
            text: options.text,
          });
        }

        if (provider === 'GMAIL_SMTP' || provider === 'CUSTOM_SMTP') {
          if (!orgSettings.smtpUser || !orgSettings.smtpPassEncrypted) {
            return { sent: false, reason: 'La configuración SMTP de la institución está incompleta.' };
          }
          const smtpPass = decryptCredential(orgSettings.smtpPassEncrypted);
          if (!smtpPass) {
            return { sent: false, reason: 'No se pudo leer la contraseña SMTP de la institución.' };
          }
          const fromEmail = options.fromEmail || orgSettings.smtpFromEmail || orgSettings.smtpUser;
          const fromName = options.fromName || orgSettings.smtpFromName || 'Events Platform';

          return this.sendWithSmtp({
            host: orgSettings.smtpHost || 'smtp.gmail.com',
            port: orgSettings.smtpPort || 587,
            secure: orgSettings.smtpSecure || false,
            user: orgSettings.smtpUser,
            pass: smtpPass,
            fromEmail,
            fromName,
            replyTo: orgSettings.replyTo || undefined,
            to: toRecipients,
            subject: options.subject,
            html: options.html,
            text: options.text,
          });
        }

        return { sent: false, reason: `Proveedor de correo no compatible para la institución: ${provider}.` };
      } catch (err: any) {
        this.logger.error(`Error resolviendo el correo de la institución [${options.organizationId}]: ${err.message}`);
        return { sent: false, reason: 'No se pudo cargar la configuración de correo de la institución.' };
      }
    }

    // Correo global de la plataforma (Administración > Configuración > Correo).
    if (!this.settings.isReady(null, 'mail')) {
      if (process.env.NODE_ENV === 'production') {
        return { sent: false, reason: 'El correo de la plataforma no está configurado (Administración > Configuración > Correo).' };
      }
      this.logger.warn(`[DEV MODE - Email Simulado] Para: ${toRecipients.join(', ')} | Asunto: "${options.subject}"`);
      this.logger.debug(`[DEV MODE - Contenido]:\n${options.text || options.html}`);
      return { sent: true, reason: 'Modo desarrollo: simulado exitosamente en consola' };
    }
    return this.sendGlobal({ ...options, to: toRecipients });
  }

  /** Envía con la configuración global guardada, usando el alias y el «Responder a» definidos por el administrador. */
  private sendGlobal(options: SendMailOptions & { to: string[] }): Promise<MailDeliveryResult> {
    const mail = this.settings.get('mail');
    const fromName = options.fromName || mail.fromName || config.appName();
    const replyTo = mail.replyTo || undefined;
    if (mail.provider === 'RESEND') {
      return this.sendWithResend({ apiKey: mail.resendApiKey, fromEmail: options.fromEmail || mail.fromEmail, fromName, replyTo, to: options.to, subject: options.subject, html: options.html, text: options.text });
    }
    return this.sendWithSmtp({
      host: mail.smtpHost,
      port: mail.smtpPort,
      secure: mail.smtpSecure,
      user: mail.smtpUser,
      pass: mail.smtpPass,
      // El alias debe estar autorizado en la cuenta SMTP (en Gmail: «Enviar como»).
      fromEmail: options.fromEmail || mail.fromEmail || mail.smtpUser,
      fromName,
      replyTo,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }

  /** Prueba del correo global: falla si no está configurado en lugar de simular. */
  async sendPlatformTest(to: string): Promise<MailDeliveryResult> {
    if (!this.settings.isReady(null, 'mail')) return { sent: false, reason: 'Completa y guarda la configuración de correo antes de probarla.' };
    const mail = this.settings.get('mail');
    const sender = mail.provider === 'RESEND' ? mail.fromEmail : (mail.fromEmail || mail.smtpUser);
    const template = this.templateService.renderNotification({
      title: 'Correo de la plataforma configurado',
      message: `Este mensaje confirma que ${config.appName()} puede enviar correos.`,
      details: [
        { label: 'Proveedor', value: mail.provider === 'RESEND' ? 'Resend' : `SMTP (${mail.smtpHost})` },
        { label: 'Remitente', value: `${mail.fromName || config.appName()} <${sender}>` },
        ...(mail.replyTo ? [{ label: 'Responder a', value: mail.replyTo }] : []),
      ],
    });
    return this.sendGlobal({ to: [to], subject: template.subject, html: template.html, text: template.text });
  }

  /**
   * Sends email with explicit credentials (used for testing connections and custom configurations).
   */
  async sendCustom(options: SendCustomMailOptions): Promise<MailDeliveryResult> {
    const toRecipients = Array.isArray(options.to) ? options.to : [options.to];
    const provider = options.provider || 'RESEND';

    if (provider === 'RESEND') {
      const apiKey = options.resendApiKey || this.settings.get('mail').resendApiKey;
      const fromEmail = options.fromEmail || options.resendFromEmail || this.settings.get('mail').fromEmail;
      const fromName = options.fromName || options.resendFromName || this.settings.get('mail').fromName || config.appName();

      if (!apiKey || apiKey.trim() === '') {
        return { sent: false, reason: 'No se ha configurado la API Key de Resend.' };
      }

      return this.sendWithResend({
        apiKey,
        fromEmail,
        fromName,
        to: toRecipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
    }

    // GMAIL_SMTP or CUSTOM_SMTP
    const host = options.smtpHost || 'smtp.gmail.com';
    const port = options.smtpPort || 587;
    const secure = options.smtpSecure ?? (port === 465);
    const user = options.smtpUser;
    const pass = options.smtpPass;
    const fromEmail = options.fromEmail || options.smtpFromEmail || user || 'no-reply@gmail.com';
    const fromName = options.fromName || options.smtpFromName || 'Events Platform';

    if (!user || !pass) {
      return { sent: false, reason: 'Faltan credenciales de usuario o contraseña para el servidor SMTP.' };
    }

    return this.sendWithSmtp({
      host,
      port,
      secure,
      user,
      pass,
      fromEmail,
      fromName,
      to: toRecipients,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }

  /**
   * Resend API execution helper
   */
  private async sendWithResend(params: {
    apiKey: string;
    fromEmail: string;
    fromName: string;
    replyTo?: string;
    to: string[];
    subject: string;
    html: string;
    text?: string;
  }): Promise<MailDeliveryResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${params.fromName} <${params.fromEmail}>`,
          reply_to: params.replyTo,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Resend falló al enviar correo a [${params.to.join(', ')}]: ${errorText}`);
        return { sent: false, reason: `Resend error: ${errorText}` };
      }

      const resData = (await response.json()) as { id?: string };
      this.logger.log(`Correo enviado vía Resend a [${params.to.join(', ')}] (ID: ${resData.id ?? 'ok'})`);
      return { sent: true, messageId: resData.id };
    } catch (error: any) {
      this.logger.error(`Excepción al enviar correo con Resend a [${params.to.join(', ')}]: ${error.message}`);
      return { sent: false, reason: error.message };
    }
  }

  /**
   * Nodemailer SMTP / Gmail execution helper
   */
  private async sendWithSmtp(params: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromEmail: string;
    fromName: string;
    replyTo?: string;
    to: string[];
    subject: string;
    html: string;
    text?: string;
  }): Promise<MailDeliveryResult> {
    try {
      const transporter = nodemailer.createTransport({
        host: params.host,
        port: params.port,
        secure: params.secure,
        auth: {
          user: params.user,
          pass: params.pass,
        },
        tls: {
          rejectUnauthorized: false, // Prevents self-signed cert issues on custom domains
        },
      });

      const info = await transporter.sendMail({
        from: `"${params.fromName}" <${params.fromEmail}>`,
        replyTo: params.replyTo,
        to: params.to.join(', '),
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      this.logger.log(`Correo enviado vía SMTP (${params.host}) a [${params.to.join(', ')}] (ID: ${info.messageId})`);
      return { sent: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Error al enviar correo vía SMTP a [${params.to.join(', ')}]: ${error.message}`);
      return { sent: false, reason: `SMTP Error: ${error.message}` };
    }
  }

  /**
   * Welcome & credentials email
   */
  async sendWelcome(to: string, data: WelcomeEmailData, organizationId?: string): Promise<MailDeliveryResult> {
    const template = this.templateService.renderWelcome({ ...data, email: to });
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      organizationId,
    });
  }

  /**
   * Password reset request email
   */
  async sendResetPassword(to: string, data: ResetPasswordEmailData, organizationId?: string): Promise<MailDeliveryResult> {
    const template = this.templateService.renderResetPassword(data);
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      organizationId,
    });
  }

  /**
   * Organization invitation email
   */
  async sendInvitation(to: string, data: OrgInvitationEmailData, organizationId?: string): Promise<MailDeliveryResult> {
    const template = this.templateService.renderInvitation(data);
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      organizationId,
    });
  }

  /**
   * Password changed notification email
   */
  async sendPasswordChanged(to: string, data: PasswordChangedEmailData, organizationId?: string): Promise<MailDeliveryResult> {
    const template = this.templateService.renderPasswordChanged(data);
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      organizationId,
    });
  }

  /**
   * Custom notification email
   */
  async sendNotification(to: string, data: GeneralNotificationEmailData, organizationId?: string): Promise<MailDeliveryResult> {
    const template = this.templateService.renderNotification(data);
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      organizationId,
    });
  }

  // --- Backwards Compatibility Helpers ---
  async credentials(to: string, name: string, password: string, organizationId?: string): Promise<MailDeliveryResult> {
    return this.sendWelcome(to, { recipientName: name, email: to, temporaryPassword: password }, organizationId);
  }

  async reset(to: string, url: string, organizationId?: string): Promise<MailDeliveryResult> {
    return this.sendResetPassword(to, { resetUrl: url }, organizationId);
  }

  async invitation(to: string, organization: string, role: string, organizationId?: string): Promise<MailDeliveryResult> {
    return this.sendInvitation(to, { organizationName: organization, role }, organizationId);
  }
}
