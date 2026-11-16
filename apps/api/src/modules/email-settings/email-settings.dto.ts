import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateEmailSettingsDto {
  @IsOptional()
  @IsIn(['RESEND', 'GMAIL_SMTP', 'CUSTOM_SMTP'])
  defaultProvider?: string;

  // Resend
  @IsOptional()
  @IsString()
  resendApiKey?: string;

  @IsOptional()
  @IsString()
  resendWebhookSecret?: string;

  @IsOptional()
  @IsString()
  resendDomain?: string;

  @IsOptional()
  @IsString()
  resendFromEmail?: string;

  @IsOptional()
  @IsString()
  resendFromName?: string;

  // SMTP / Gmail
  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsNumber()
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  smtpUser?: string;

  @IsOptional()
  @IsString()
  smtpPass?: string;

  @IsOptional()
  @IsString()
  smtpFromEmail?: string;

  @IsOptional()
  @IsString()
  smtpFromName?: string;

  /** Dirección que recibe las respuestas; vacía para quitarla. */
  @IsOptional()
  @IsString()
  replyTo?: string;

  @IsOptional()
  verifiedSenders?: Array<{ email: string; name?: string; label?: string }>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestEmailSettingsDto {
  @IsString()
  recipientEmail!: string;

  @IsOptional()
  @IsIn(['RESEND', 'GMAIL_SMTP', 'CUSTOM_SMTP'])
  provider?: string;

  // Optional overrides to test before saving
  @IsOptional()
  @IsString()
  resendApiKey?: string;

  @IsOptional()
  @IsString()
  resendFromEmail?: string;

  @IsOptional()
  @IsString()
  resendFromName?: string;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsNumber()
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  smtpUser?: string;

  @IsOptional()
  @IsString()
  smtpPass?: string;

  @IsOptional()
  @IsString()
  smtpFromEmail?: string;

  @IsOptional()
  @IsString()
  smtpFromName?: string;
}
