export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  organizationId?: string;
  /** Evita que comunicaciones institucionales usen accidentalmente el proveedor global. */
  requireOrganizationCredentials?: boolean;
}

export interface SendCustomMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  provider?: 'RESEND' | 'GMAIL_SMTP' | 'CUSTOM_SMTP';
  resendApiKey?: string;
  resendFromEmail?: string;
  resendFromName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFromEmail?: string;
  smtpFromName?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
}

export interface MailDeliveryResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
}

export interface WelcomeEmailData {
  recipientName?: string;
  email: string;
  temporaryPassword?: string;
  loginUrl?: string;
  organizationName?: string;
  role?: string;
}

export interface ResetPasswordEmailData {
  recipientName?: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export interface OrgInvitationEmailData {
  recipientName?: string;
  organizationName: string;
  role: string;
  inviterName?: string;
  acceptUrl?: string;
}

export interface PasswordChangedEmailData {
  recipientName?: string;
  email: string;
  changedAt?: string;
}

export interface GeneralNotificationEmailData {
  recipientName?: string;
  title: string;
  subtitle?: string;
  message: string;
  actionText?: string;
  actionUrl?: string;
  details?: Array<{ label: string; value: string }>;
}
