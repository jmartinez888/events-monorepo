/**
 * Configuración editable desde el panel en lugar de variables de entorno.
 * - `mail` (alcance plataforma): correo del sistema para cuentas (códigos, contraseñas).
 *   Lo edita un SUPER_ADMIN en Administración > Configuración.
 * - El resto (alcance institución): cada institución configura sus propias
 *   integraciones en Configuración > Integraciones.
 * Los campos `secret` se guardan cifrados y nunca vuelven al navegador.
 */
type FieldDef =
  | { type: 'string'; secret?: boolean; default?: string; format?: 'url' | 'email' | 'handle'; options?: readonly string[] }
  | { type: 'number'; default: number; min: number; max: number }
  | { type: 'boolean'; default: boolean };

export const SETTINGS_SECTIONS = {
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
    organizationFallback: { type: 'boolean', default: false },
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

export type SectionKey = keyof typeof SETTINGS_SECTIONS;
export type OrganizationSectionKey = Exclude<SectionKey, 'mail'>;
export const PLATFORM_SECTION_KEYS = ['mail'] as const satisfies readonly SectionKey[];
export const ORGANIZATION_SECTION_KEYS = ['zoom', 'facebook', 'attendance', 'certificates', 'telegram'] as const satisfies readonly OrganizationSectionKey[];

type ValueOf<F> = F extends { type: 'number' } ? number : F extends { type: 'boolean' } ? boolean : string;
export type SectionConfig<K extends SectionKey> = { -readonly [F in keyof (typeof SETTINGS_SECTIONS)[K]]: ValueOf<(typeof SETTINGS_SECTIONS)[K][F]> };

export function fieldsOf(key: SectionKey): Record<string, FieldDef> {
  return SETTINGS_SECTIONS[key] as Record<string, FieldDef>;
}

export function isSecret(field: FieldDef) {
  return field.type === 'string' && !!field.secret;
}

export function defaultsOf(key: SectionKey) {
  return Object.fromEntries(Object.entries(fieldsOf(key)).map(([name, field]) => [name, 'default' in field && field.default !== undefined ? field.default : ''])) as Record<string, string | number | boolean>;
}
