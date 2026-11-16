import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { UpdateEmailSettingsDto, TestEmailSettingsDto } from './email-settings.dto.js';
import { encryptCredential, decryptCredential, maskSecret } from '../../common/utils/encryption.util.js';
import { MailService } from '../mail/mail.service.js';

@Injectable()
export class EmailSettingsService {
  private readonly logger = new Logger(EmailSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Retrieves organization email settings with sensitive fields masked.
   */
  async getSettings(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { emailSettings: true },
    });

    if (!org) {
      throw new NotFoundException('Organización no encontrada.');
    }

    const settings = org.emailSettings;

    if (!settings) {
      return {
        configured: false,
        defaultProvider: 'RESEND',
        resendApiKeyMasked: '',
        resendWebhookSecretMasked: '',
        resendDomain: '',
        resendFromEmail: '',
        resendFromName: org.name || '',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: '',
        smtpPassMasked: '',
        smtpFromEmail: '',
        smtpFromName: org.name || '',
        replyTo: '',
        verifiedSenders: [],
        isActive: false,
        isUsingSystemFallback: false,
        deliveryReady: false,
        defaultSender: null,
      };
    }

    const provider = settings.defaultProvider || 'RESEND';
    const resendSecret = decryptCredential(settings.resendApiKeyEncrypted || '');
    const resendWebhookSecret = decryptCredential(settings.resendWebhookSecretEncrypted || '');
    const smtpSecret = decryptCredential(settings.smtpPassEncrypted || '');
    const credentialNeedsRotation = Boolean(
      (settings.resendApiKeyEncrypted && !resendSecret) ||
      (settings.resendWebhookSecretEncrypted && !resendWebhookSecret) ||
      (settings.smtpPassEncrypted && !smtpSecret),
    );
    const hasCredentials = provider === 'RESEND'
      ? Boolean(resendSecret && settings.resendFromEmail)
      : Boolean(settings.smtpUser && smtpSecret && (settings.smtpFromEmail || settings.smtpUser));
    const defaultSender = provider === 'RESEND'
      ? settings.resendFromEmail
      : (settings.smtpFromEmail || settings.smtpUser);

    return {
      configured: true,
      defaultProvider: provider,
      resendApiKeyMasked: resendSecret ? maskSecret(resendSecret) : '',
      resendWebhookSecretMasked: resendWebhookSecret ? maskSecret(resendWebhookSecret) : '',
      resendDomain: settings.resendDomain || (settings.resendFromEmail?.includes('@') ? settings.resendFromEmail.split('@')[1] : ''),
      resendFromEmail: settings.resendFromEmail || '',
      resendFromName: settings.resendFromName || '',
      smtpHost: settings.smtpHost || 'smtp.gmail.com',
      smtpPort: settings.smtpPort || 587,
      smtpSecure: settings.smtpSecure || false,
      smtpUser: settings.smtpUser || '',
      smtpPassMasked: smtpSecret ? maskSecret(smtpSecret) : '',
      smtpFromEmail: settings.smtpFromEmail || '',
      smtpFromName: settings.smtpFromName || '',
      replyTo: settings.replyTo || '',
      verifiedSenders: (settings.verifiedSenders as any[]) || [],
      isActive: settings.isActive,
      isUsingSystemFallback: !settings.resendApiKeyEncrypted && !settings.smtpPassEncrypted,
      deliveryReady: Boolean(settings.isActive && hasCredentials),
      defaultSender: defaultSender || null,
      credentialNeedsRotation,
    };
  }

  /**
   * Updates or creates organization email settings with AES-256 encryption for secrets.
   */
  async updateSettings(organizationId: string, dto: UpdateEmailSettingsDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { emailSettings: true },
    });

    if (!org) {
      throw new NotFoundException('Organización no encontrada.');
    }

    const current = org.emailSettings;

    // Encrypt resendApiKey if a new one is provided (not masked)
    let resendApiKeyEncrypted = current?.resendApiKeyEncrypted;
    if (dto.resendApiKey && !dto.resendApiKey.includes('••••')) {
      resendApiKeyEncrypted = encryptCredential(dto.resendApiKey);
    }

    let resendWebhookSecretEncrypted = current?.resendWebhookSecretEncrypted;
    if (dto.resendWebhookSecret && !dto.resendWebhookSecret.includes('••••')) {
      resendWebhookSecretEncrypted = encryptCredential(dto.resendWebhookSecret);
    }

    // Encrypt smtpPass if a new one is provided (not masked)
    let smtpPassEncrypted = current?.smtpPassEncrypted;
    if (dto.smtpPass && !dto.smtpPass.includes('••••')) {
      smtpPassEncrypted = encryptCredential(dto.smtpPass);
    }

    // Auto calculate domain if not provided
    let resendDomain = dto.resendDomain;
    if (!resendDomain && dto.resendFromEmail?.includes('@')) {
      resendDomain = dto.resendFromEmail.split('@')[1].trim();
    }

    const updated = await this.prisma.organizationEmailSettings.upsert({
      where: { organizationId },
      update: {
        defaultProvider: dto.defaultProvider ?? current?.defaultProvider ?? 'RESEND',
        resendApiKeyEncrypted,
        resendWebhookSecretEncrypted,
        resendDomain: resendDomain ?? current?.resendDomain,
        resendFromEmail: dto.resendFromEmail ?? current?.resendFromEmail,
        resendFromName: dto.resendFromName ?? current?.resendFromName,
        smtpHost: dto.smtpHost ?? current?.smtpHost,
        smtpPort: dto.smtpPort ?? current?.smtpPort,
        smtpSecure: dto.smtpSecure ?? current?.smtpSecure,
        smtpUser: dto.smtpUser ?? current?.smtpUser,
        smtpPassEncrypted,
        smtpFromEmail: dto.smtpFromEmail ?? current?.smtpFromEmail,
        smtpFromName: dto.smtpFromName ?? current?.smtpFromName,
        replyTo: dto.replyTo !== undefined ? (dto.replyTo.trim() || null) : current?.replyTo,
        verifiedSenders: dto.verifiedSenders ?? current?.verifiedSenders ?? undefined,
        isActive: dto.isActive ?? current?.isActive ?? true,
      },
      create: {
        organizationId,
        defaultProvider: dto.defaultProvider ?? 'RESEND',
        resendApiKeyEncrypted,
        resendWebhookSecretEncrypted,
        resendDomain,
        resendFromEmail: dto.resendFromEmail,
        resendFromName: dto.resendFromName,
        smtpHost: dto.smtpHost || 'smtp.gmail.com',
        smtpPort: dto.smtpPort || 587,
        smtpSecure: dto.smtpSecure || false,
        smtpUser: dto.smtpUser,
        smtpPassEncrypted,
        smtpFromEmail: dto.smtpFromEmail,
        smtpFromName: dto.smtpFromName,
        replyTo: dto.replyTo?.trim() || null,
        verifiedSenders: dto.verifiedSenders ?? undefined,
        isActive: dto.isActive ?? true,
      },
    });

    this.logger.log(`Ajustes de correo actualizados para la organización [${org.name}] (${organizationId})`);
    return this.getSettings(organizationId);
  }

  /**
   * Sends a test email to verify credentials and domain deliverability.
   */
  async testConnection(organizationId: string, dto: TestEmailSettingsDto) {
    if (!dto.recipientEmail || !dto.recipientEmail.includes('@')) {
      throw new BadRequestException('Debes proporcionar un correo destinatario válido.');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { emailSettings: true },
    });

    if (!org) {
      throw new NotFoundException('Organización no encontrada.');
    }

    const settings = org.emailSettings;
    const provider = dto.provider || settings?.defaultProvider || 'RESEND';

    let resendApiKey = dto.resendApiKey;
    if (!resendApiKey || resendApiKey.includes('••••')) {
      resendApiKey = settings?.resendApiKeyEncrypted ? decryptCredential(settings.resendApiKeyEncrypted) : undefined;
    }

    let smtpPass = dto.smtpPass;
    if (!smtpPass || smtpPass.includes('••••')) {
      smtpPass = settings?.smtpPassEncrypted ? decryptCredential(settings.smtpPassEncrypted) : undefined;
    }

    const fromEmail = dto.resendFromEmail || dto.smtpFromEmail || settings?.resendFromEmail || settings?.smtpFromEmail || settings?.smtpUser || '';
    const fromName = dto.resendFromName || dto.smtpFromName || settings?.resendFromName || settings?.smtpFromName || org.name || 'Zynqro Events';

    const testSubject = `🎉 Verificación de correo exitosa - ${org.name}`;
    const testHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="display: inline-block; background-color: #10b981; color: white; width: 48px; height: 48px; line-height: 48px; border-radius: 50%; font-size: 24px;">✓</div>
          <h2 style="color: #0f172a; margin: 12px 0 4px 0;">¡Configuración de Correo Exitosa!</h2>
          <p style="color: #64748b; font-size: 14px; margin: 0;">Tu conexión de envío para <strong>${org.name}</strong> está funcionando perfectamente.</p>
        </div>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; font-size: 13px; color: #334155;">
          <p style="margin: 0 0 8px 0;"><strong>Detalles del envío:</strong></p>
          <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
            <li><strong>Proveedor:</strong> ${provider}</li>
            <li><strong>Remitente:</strong> ${fromName} &lt;${fromEmail}&gt;</li>
            <li><strong>Destinatario:</strong> ${dto.recipientEmail}</li>
            <li><strong>Fecha y hora:</strong> ${new Date().toLocaleString('es-ES')}</li>
          </ul>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          Este es un mensaje de prueba enviado desde el panel de administración de Zynqro Events.
        </p>
      </div>
    `;

    const result = await this.mailService.sendCustom({
      provider: provider as any,
      resendApiKey: resendApiKey || undefined,
      resendFromEmail: fromEmail,
      resendFromName: fromName,
      smtpHost: dto.smtpHost || settings?.smtpHost || 'smtp.gmail.com',
      smtpPort: dto.smtpPort || settings?.smtpPort || 587,
      smtpSecure: dto.smtpSecure ?? settings?.smtpSecure ?? false,
      smtpUser: dto.smtpUser || settings?.smtpUser || undefined,
      smtpPass: smtpPass || undefined,
      to: dto.recipientEmail,
      subject: testSubject,
      html: testHtml,
    });

    if (!result.sent) {
      throw new BadRequestException(`No se pudo enviar el correo de prueba: ${result.reason || 'Error desconocido'}`);
    }

    return {
      success: true,
      message: `Correo de prueba enviado exitosamente a ${dto.recipientEmail}`,
      messageId: result.messageId,
    };
  }
}
