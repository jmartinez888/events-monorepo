/**
 * Secciones de configuración global editables desde Administración > Configuración.
 * Sustituyen a las variables de entorno SMTP_*, RESEND_*, ZOOM_*, FACEBOOK_*,
 * ATTENDANCE_*, CERTIFICATES_*, TELEGRAM_*, EMAIL_TRACKING_BASE_URL y MAIL_SYSTEM_FALLBACK.
 * Los campos `secret` se guardan cifrados y nunca vuelven al navegador.
 */
type FieldDef =
  | { type: 'string'; secret?: boolean; default?: string; format?: 'url' | 'email' | 'handle'; options?: readonly string[] }
  | { type: 'number'; default: number; min: number; max: number }
  | { type: 'boolean'; default: boolean };

export const PLATFORM_SECTIONS = {
  mail: {
    provider: { type: 'string', default: 'SMTP', options: ['SMTP', 'RESEND'] },
    smtpHost: { type: 'string', default: '' },
    smtpPort: { type: 'number', default: 465, min: 1, max: 65535 },
    smtpSecure: { type: 'boolean', default: true },
    smtpUser: { type: 'string', default: '' },
    smtpPass: { type: 'string', secret: true },
    resendApiKey: { type: 'string', secret: true },
    resendWebhookSecret: { type: 'string', secret: true },
    /** Alias de envío: dirección que ve el destinatario en «De:». Puede diferir de la cuenta SMTP. */
    fromEmail: { type: 'string', default: '', format: 'email' },
    fromName: { type: 'string', default: 'Eventos IIAP' },
    replyTo: { type: 'string', default: '', format: 'email' },
    trackingBaseUrl: { type: 'string', default: '', format: 'url' },
    organizationFallback: { type: 'boolean', default: true },
  },
  zoom: {
    accountId: { type: 'string', default: '' },
    clientId: { type: 'string', default: '' },
    clientSecret: { type: 'string', secret: true },
    userId: { type: 'string', default: 'me' },
    webhookSecret: { type: 'string', secret: true },
    autoRecording: { type: 'string', default: 'none', options: ['none', 'local', 'cloud'] },
  },
  facebook: {
    pageId: { type: 'string', default: '' },
    pageAccessToken: { type: 'string', secret: true },
    graphVersion: { type: 'string', default: 'v21.0' },
  },
  attendance: {
    apiUrl: { type: 'string', default: '', format: 'url' },
    apiToken: { type: 'string', secret: true },
    webhookSecret: { type: 'string', secret: true },
    serviceKey: { type: 'string', secret: true },
  },
  certificates: {
    apiUrl: { type: 'string', default: '', format: 'url' },
    apiKey: { type: 'string', secret: true },
  },
  telegram: {
    botToken: { type: 'string', secret: true },
    botUsername: { type: 'string', default: '', format: 'handle' },
    webhookSecret: { type: 'string', secret: true },
  },
} as const satisfies Record<string, Record<string, FieldDef>>;

export type SectionKey = keyof typeof PLATFORM_SECTIONS;
export const SECTION_KEYS = Object.keys(PLATFORM_SECTIONS) as SectionKey[];

type ValueOf<F> = F extends { type: 'number' } ? number : F extends { type: 'boolean' } ? boolean : string;
export type SectionConfig<K extends SectionKey> = { -readonly [F in keyof (typeof PLATFORM_SECTIONS)[K]]: ValueOf<(typeof PLATFORM_SECTIONS)[K][F]> };

export function fieldsOf(key: SectionKey): Record<string, FieldDef> {
  return PLATFORM_SECTIONS[key] as Record<string, FieldDef>;
}

export function isSecret(field: FieldDef) {
  return field.type === 'string' && !!field.secret;
}

export function defaultsOf(key: SectionKey) {
  return Object.fromEntries(Object.entries(fieldsOf(key)).map(([name, field]) => [name, 'default' in field && field.default !== undefined ? field.default : ''])) as Record<string, string | number | boolean>;
}
