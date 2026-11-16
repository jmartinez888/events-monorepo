import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { decryptCredential, encryptCredential, maskSecret } from '../../common/utils/encryption.util.js';
import { config } from '../../common/config.js';
import { PLATFORM_SECTIONS, SECTION_KEYS, SectionConfig, SectionKey, defaultsOf, fieldsOf, isSecret } from './platform-settings.schema.js';

interface CachedSection { enabled: boolean; data: Record<string, string | number | boolean>; updatedAt: Date | null; stored: boolean }

export interface SectionUpdate {
  enabled?: boolean;
  values?: Record<string, unknown>;
  /** Cadena nueva: reemplaza. Cadena vacía: borra. Ausente: conserva. */
  secrets?: Record<string, string | null | undefined>;
}

const REFRESH_MS = 30_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Configuración global guardada en base de datos. Los clientes de proveedores la
 * leen de forma síncrona desde una caché en memoria que se recarga al guardar y
 * cada 30 s, para que varias réplicas de la API converjan sin reiniciar.
 */
@Injectable()
export class PlatformSettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private cache = new Map<SectionKey, CachedSection>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload().catch((error) => this.logger.error(`No se pudo cargar la configuración de la plataforma: ${error?.message ?? error}`));
    this.timer = setInterval(() => void this.reload().catch(() => undefined), REFRESH_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reload() {
    const rows = await this.prisma.platformSetting.findMany();
    const next = new Map<SectionKey, CachedSection>();
    for (const key of SECTION_KEYS) {
      const row = rows.find((item) => item.key === key);
      const data = { ...defaultsOf(key) };
      const values = (row?.values ?? {}) as Record<string, unknown>;
      const secrets = (row?.secrets ?? {}) as Record<string, unknown>;
      for (const [name, field] of Object.entries(fieldsOf(key))) {
        if (isSecret(field)) data[name] = typeof secrets[name] === 'string' ? decryptCredential(secrets[name] as string) : '';
        else if (values[name] !== undefined && values[name] !== null) data[name] = values[name] as string | number | boolean;
      }
      next.set(key, { enabled: row?.enabled ?? true, data, updatedAt: row?.updatedAt ?? null, stored: !!row });
    }
    this.cache = next;
  }

  /** Configuración efectiva. Una sección desactivada se comporta como vacía. */
  get<K extends SectionKey>(key: K): SectionConfig<K> {
    const section = this.cache.get(key);
    if (!section || !section.enabled) return defaultsOf(key) as SectionConfig<K>;
    return section.data as SectionConfig<K>;
  }

  /** Vista para el panel: valores visibles y, de los secretos, solo si existen y su máscara. */
  describe() {
    const api = config.apiPublicUrl();
    const tracking = (this.get('mail').trackingBaseUrl || api).replace(/\/+$/, '');
    const endpoints: Record<SectionKey, Record<string, string>> = {
      mail: { resendWebhook: `${tracking}/email-tracking/provider-events` },
      zoom: { webhook: `${api}/webhooks/zoom` },
      facebook: {},
      attendance: { webhook: `${api}/webhooks/attendance`, personRegistrations: `${api}/integrations/attendance/person-registrations` },
      certificates: {},
      telegram: { webhook: `${api}/webhooks/telegram` },
    };
    return SECTION_KEYS.map((key) => {
      const section = this.cache.get(key)!;
      const values: Record<string, unknown> = {};
      const secrets: Record<string, { set: boolean; masked: string }> = {};
      for (const [name, field] of Object.entries(fieldsOf(key))) {
        const value = section?.data[name];
        if (isSecret(field)) secrets[name] = { set: !!value, masked: value ? maskSecret(String(value)) : '' };
        else values[name] = value;
      }
      return { key, enabled: section?.enabled ?? true, configured: this.isReady(key), stored: section?.stored ?? false, updatedAt: section?.updatedAt ?? null, values, secrets, endpoints: endpoints[key] };
    });
  }

  /** Mínimo para que la integración funcione (las comprobaciones de los clientes usan lo mismo). */
  isReady(key: SectionKey) {
    switch (key) {
      case 'mail': {
        const mail = this.get('mail');
        return mail.provider === 'RESEND' ? !!(mail.resendApiKey && mail.fromEmail) : !!(mail.smtpHost && mail.smtpUser && mail.smtpPass);
      }
      case 'zoom': { const zoom = this.get('zoom'); return !!(zoom.accountId && zoom.clientId && zoom.clientSecret); }
      case 'facebook': { const facebook = this.get('facebook'); return !!(facebook.pageId && facebook.pageAccessToken); }
      case 'attendance': { const attendance = this.get('attendance'); return !!(attendance.apiUrl && attendance.apiToken); }
      case 'certificates': { const certificates = this.get('certificates'); return !!(certificates.apiUrl && certificates.apiKey); }
      case 'telegram': { const telegram = this.get('telegram'); return !!(telegram.botToken && telegram.botUsername); }
    }
  }

  async update(key: string, input: SectionUpdate, accountId?: string) {
    if (!(key in PLATFORM_SECTIONS)) throw new NotFoundException('Sección de configuración desconocida');
    const section = key as SectionKey;
    const fields = fieldsOf(section);
    const current = await this.prisma.platformSetting.findUnique({ where: { key: section } });
    const values = { ...((current?.values ?? {}) as Record<string, unknown>) };
    const secrets = { ...((current?.secrets ?? {}) as Record<string, unknown>) };

    for (const [name, raw] of Object.entries(input.values ?? {})) {
      const field = fields[name];
      if (!field || isSecret(field)) throw new BadRequestException(`Campo no válido: ${name}`);
      values[name] = this.normalize(name, field, raw);
    }
    for (const [name, raw] of Object.entries(input.secrets ?? {})) {
      const field = fields[name];
      if (!field || !isSecret(field)) throw new BadRequestException(`Campo secreto no válido: ${name}`);
      if (raw === undefined) continue;
      const value = String(raw ?? '').trim();
      if (value) secrets[name] = encryptCredential(value);
      else delete secrets[name];
    }

    await this.prisma.platformSetting.upsert({
      where: { key: section },
      create: { key: section, enabled: input.enabled ?? true, values: values as Prisma.InputJsonValue, secrets: secrets as Prisma.InputJsonValue, updatedBy: accountId },
      update: { enabled: input.enabled ?? current?.enabled ?? true, values: values as Prisma.InputJsonValue, secrets: secrets as Prisma.InputJsonValue, updatedBy: accountId },
    });
    await this.reload();
    this.logger.log(`Configuración "${section}" actualizada`);
    return this.describe().find((item) => item.key === section)!;
  }

  private normalize(name: string, field: ReturnType<typeof fieldsOf>[string], raw: unknown) {
    if (field.type === 'boolean') return raw === true || raw === 'true';
    if (field.type === 'number') {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < field.min || value > field.max) throw new BadRequestException(`${name}: debe ser un número entre ${field.min} y ${field.max}`);
      return value;
    }
    let value = String(raw ?? '').trim();
    if (field.options && !field.options.includes(value)) throw new BadRequestException(`${name}: valor no permitido`);
    if (!value) return '';
    if (field.format === 'url') {
      if (!/^https?:\/\/[^\s]+$/i.test(value)) throw new BadRequestException(`${name}: escribe una URL que empiece con http:// o https://`);
      value = value.replace(/\/+$/, '');
    }
    if (field.format === 'email' && !EMAIL.test(value)) throw new BadRequestException(`${name}: correo no válido`);
    if (field.format === 'handle') value = value.replace(/^@/, '');
    return value.slice(0, 500);
  }
}
