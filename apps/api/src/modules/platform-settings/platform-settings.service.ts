import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { decryptCredential, encryptCredential, maskSecret } from '../../common/utils/encryption.util.js';
import { config } from '../../common/config.js';
import { ORGANIZATION_SECTION_KEYS, OrganizationSectionKey, PLATFORM_SECTION_KEYS, SectionConfig, SectionKey, defaultsOf, fieldsOf, isSecret } from './platform-settings.schema.js';

interface CachedSection { enabled: boolean; data: Record<string, string | number | boolean>; updatedAt: Date | null; stored: boolean }
interface StoredRow { key: string; enabled: boolean; values: Prisma.JsonValue; secrets: Prisma.JsonValue; updatedAt: Date }

export interface SectionUpdate {
  enabled?: boolean;
  values?: Record<string, unknown>;
  /** Cadena nueva: reemplaza. Cadena vacía: borra. Ausente: conserva. */
  secrets?: Record<string, string | null | undefined>;
}

const REFRESH_MS = 30_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Configuración guardada en base de datos: el correo del sistema (plataforma) y
 * las integraciones de cada institución. Los clientes la leen de forma síncrona
 * desde una caché en memoria que se recarga al guardar y cada 30 s, para que
 * varias réplicas de la API converjan sin reiniciar.
 */
@Injectable()
export class PlatformSettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private platform = new Map<SectionKey, CachedSection>();
  private organizations = new Map<string, Map<SectionKey, CachedSection>>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload().catch((error) => this.logger.error(`No se pudo cargar la configuración: ${error?.message ?? error}`));
    this.timer = setInterval(() => void this.reload().catch(() => undefined), REFRESH_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reload() {
    const [platformRows, organizationRows] = await Promise.all([this.prisma.platformSetting.findMany(), this.prisma.organizationIntegrationSetting.findMany()]);
    this.platform = this.build(PLATFORM_SECTION_KEYS, platformRows);
    const grouped = new Map<string, StoredRow[]>();
    for (const row of organizationRows) grouped.set(row.organizationId, [...(grouped.get(row.organizationId) ?? []), row]);
    this.organizations = new Map([...grouped].map(([organizationId, rows]) => [organizationId, this.build(ORGANIZATION_SECTION_KEYS, rows)]));
  }

  private build(keys: readonly SectionKey[], rows: StoredRow[]) {
    const result = new Map<SectionKey, CachedSection>();
    for (const key of keys) {
      const row = rows.find((item) => item.key === key);
      const data = { ...defaultsOf(key) };
      const values = (row?.values ?? {}) as Record<string, unknown>;
      const secrets = (row?.secrets ?? {}) as Record<string, unknown>;
      for (const [name, field] of Object.entries(fieldsOf(key))) {
        if (isSecret(field)) data[name] = typeof secrets[name] === 'string' ? decryptCredential(secrets[name] as string) : '';
        else if (values[name] !== undefined && values[name] !== null) data[name] = values[name] as string | number | boolean;
      }
      result.set(key, { enabled: row?.enabled ?? true, data, updatedAt: row?.updatedAt ?? null, stored: !!row });
    }
    return result;
  }

  private section(scope: string | null, key: SectionKey) {
    return scope === null ? this.platform.get(key) : this.organizations.get(scope)?.get(key);
  }

  /** Correo del sistema. Desactivado se comporta como vacío. */
  get<K extends 'mail'>(key: K): SectionConfig<K> {
    const section = this.section(null, key);
    return (section?.enabled ? section.data : defaultsOf(key)) as SectionConfig<K>;
  }

  /** Integración de una institución. Sin institución, o desactivada, se comporta como vacía. */
  forOrganization<K extends OrganizationSectionKey>(organizationId: string | null | undefined, key: K): SectionConfig<K> {
    const section = organizationId ? this.section(organizationId, key) : undefined;
    return (section?.enabled ? section.data : defaultsOf(key)) as SectionConfig<K>;
  }

  /** Mínimo para que el servicio funcione. `scope` null es la plataforma. */
  isReady(scope: string | null | undefined, key: SectionKey) {
    switch (key) {
      case 'mail': {
        const mail = this.get('mail');
        return mail.provider === 'RESEND' ? !!(mail.resendApiKey && mail.fromEmail) : !!(mail.smtpHost && mail.smtpUser && mail.smtpPass);
      }
      case 'zoom': { const zoom = this.forOrganization(scope, 'zoom'); return !!(zoom.accountId && zoom.clientId && zoom.clientSecret); }
      case 'facebook': { const facebook = this.forOrganization(scope, 'facebook'); return !!(facebook.pageId && facebook.pageAccessToken); }
      case 'attendance': { const attendance = this.forOrganization(scope, 'attendance'); return !!(attendance.apiUrl && attendance.apiToken); }
      case 'certificates': { const certificates = this.forOrganization(scope, 'certificates'); return !!(certificates.apiUrl && certificates.apiKey); }
      case 'telegram': { const telegram = this.forOrganization(scope, 'telegram'); return !!(telegram.botToken && telegram.botUsername); }
    }
  }

  /** Vista para el panel: valores visibles y, de los secretos, solo si existen y su máscara. */
  describe(scope: string | null) {
    const api = config.apiPublicUrl();
    const keys: readonly SectionKey[] = scope === null ? PLATFORM_SECTION_KEYS : ORGANIZATION_SECTION_KEYS;
    const org = scope ? encodeURIComponent(scope) : '';
    const endpoints: Record<SectionKey, Record<string, string>> = {
      mail: { resendWebhook: `${(this.get('mail').trackingBaseUrl || api).replace(/\/+$/, '')}/email-tracking/provider-events` },
      zoom: { webhook: `${api}/webhooks/zoom/${org}` },
      facebook: {},
      attendance: { webhook: `${api}/webhooks/attendance/${org}`, personRegistrations: `${api}/integrations/attendance/${org}/person-registrations` },
      certificates: {},
      telegram: { webhook: `${api}/webhooks/telegram/${org}` },
    };
    return keys.map((key) => {
      const section = this.section(scope, key);
      const data = section?.data ?? defaultsOf(key);
      const values: Record<string, unknown> = {};
      const secrets: Record<string, { set: boolean; masked: string }> = {};
      for (const [name, field] of Object.entries(fieldsOf(key))) {
        const value = data[name];
        if (isSecret(field)) secrets[name] = { set: !!value, masked: value ? maskSecret(String(value)) : '' };
        else values[name] = value;
      }
      return { key, enabled: section?.enabled ?? true, configured: this.isReady(scope, key), stored: section?.stored ?? false, updatedAt: section?.updatedAt ?? null, values, secrets, endpoints: endpoints[key] };
    });
  }

  /** `scope` null guarda el correo del sistema; un id guarda la integración de esa institución. */
  async update(scope: string | null, key: string, input: SectionUpdate, accountId?: string) {
    const allowed: readonly string[] = scope === null ? PLATFORM_SECTION_KEYS : ORGANIZATION_SECTION_KEYS;
    if (!allowed.includes(key)) throw new NotFoundException('Sección de configuración desconocida');
    const section = key as SectionKey;
    const fields = fieldsOf(section);
    const current = scope === null
      ? await this.prisma.platformSetting.findUnique({ where: { key: section } })
      : await this.prisma.organizationIntegrationSetting.findUnique({ where: { organizationId_key: { organizationId: scope, key: section } } });
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

    const data = { enabled: input.enabled ?? current?.enabled ?? true, values: values as Prisma.InputJsonValue, secrets: secrets as Prisma.InputJsonValue, updatedBy: accountId };
    if (scope === null) await this.prisma.platformSetting.upsert({ where: { key: section }, create: { key: section, ...data }, update: data });
    else await this.prisma.organizationIntegrationSetting.upsert({ where: { organizationId_key: { organizationId: scope, key: section } }, create: { organizationId: scope, key: section, ...data }, update: data });
    await this.reload();
    this.logger.log(`Configuración "${section}" actualizada (${scope ?? 'plataforma'})`);
    return this.describe(scope).find((item) => item.key === section)!;
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
