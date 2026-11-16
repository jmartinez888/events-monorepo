import { BadRequestException, Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { OrganizationSettingsAccess } from './organization-access.js';
import { IsBoolean, IsEmail, IsObject, IsOptional } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard.js';
import { PlatformSettingsService } from './platform-settings.service.js';
import { MailService } from '../mail/mail.service.js';
import { ZoomClient } from '../integrations/providers/zoom.client.js';
import { FacebookClient } from '../integrations/providers/facebook.client.js';
import { AttendanceClient } from '../integrations/providers/attendance.client.js';
import { TelegramClient } from '../integrations/providers/telegram.client.js';
import { PrismaService } from '../../database/prisma.service.js';

class UpdateSectionDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsObject() values?: Record<string, unknown>;
  @IsOptional() @IsObject() secrets?: Record<string, string | null>;
}

class TestSectionDto {
  @IsOptional() @IsEmail() recipient?: string;
}

type AuthedRequest = { user?: { accountId?: string; role?: string } };

async function run<T>(call: () => Promise<T>) {
  try {
    return await call();
  } catch (error: any) {
    throw new BadRequestException(error?.message ?? 'El proveedor no respondió');
  }
}

function requireReady(ready: boolean, name: string) {
  if (!ready) throw new BadRequestException(`Completa y guarda la configuración de ${name} antes de probarla`);
}

/** Administración > Configuración: correo del sistema (códigos de acceso y contraseñas). Solo SUPER_ADMIN. */
@UseGuards(AdminGuard)
@Controller('admin/settings')
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService, private readonly prisma: PrismaService, private readonly mail: MailService) {}

  @Get()
  async list() {
    await this.settings.reload();
    return this.settings.describe(null);
  }

  @Patch(':section')
  update(@Param('section') section: string, @Body() dto: UpdateSectionDto, @Req() request: AuthedRequest) {
    return this.settings.update(null, section, dto, request.user?.accountId);
  }

  @Post('mail/test') @HttpCode(200)
  async test(@Body() dto: TestSectionDto, @Req() request: AuthedRequest) {
    const account = request.user?.accountId ? await this.prisma.authUser.findUnique({ where: { id: request.user.accountId }, select: { email: true } }) : null;
    const recipient = dto.recipient || account?.email;
    if (!recipient) throw new BadRequestException('Indica un correo destinatario');
    const result = await this.mail.sendPlatformTest(recipient);
    if (!result.sent) throw new BadRequestException(result.reason || 'No se pudo enviar el correo de prueba');
    return { ok: true, message: `Correo de prueba enviado a ${recipient}` };
  }
}

/** Configuración > Integraciones de cada institución. */
@Controller('organizations/:organizationId/integration-settings')
export class OrganizationIntegrationSettingsController {
  constructor(
    private readonly access: OrganizationSettingsAccess,
    private readonly settings: PlatformSettingsService,
    private readonly zoom: ZoomClient,
    private readonly facebook: FacebookClient,
    private readonly attendance: AttendanceClient,
    private readonly telegram: TelegramClient,
  ) {}

  @Get()
  async list(@Param('organizationId', ParseUUIDPipe) organizationId: string, @Req() request: AuthedRequest) {
    await this.access.assert(organizationId, request.user?.accountId);
    await this.settings.reload();
    return this.settings.describe(organizationId);
  }

  @Patch(':section')
  async update(@Param('organizationId', ParseUUIDPipe) organizationId: string, @Param('section') section: string, @Body() dto: UpdateSectionDto, @Req() request: AuthedRequest) {
    await this.access.assert(organizationId, request.user?.accountId);
    return this.settings.update(organizationId, section, dto, request.user?.accountId);
  }

  /** Prueba la configuración guardada de la institución contra el proveedor real. */
  @Post(':section/test') @HttpCode(200)
  async test(@Param('organizationId', ParseUUIDPipe) organizationId: string, @Param('section') section: string, @Req() request: AuthedRequest) {
    await this.access.assert(organizationId, request.user?.accountId);
    switch (section) {
      case 'zoom': {
        requireReady(this.zoom.configured(organizationId), 'Zoom');
        const user = await run(() => this.zoom.getHostUser(organizationId));
        return { ok: true, message: `Conectado como ${[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || user.id}` };
      }
      case 'facebook': {
        requireReady(this.facebook.configured(organizationId), 'Facebook Live');
        const page = await run(() => this.facebook.getPage(organizationId));
        return { ok: true, message: `Página conectada: ${page.name}` };
      }
      case 'attendance': {
        requireReady(this.attendance.configured(organizationId), 'el Sistema de Asistencia');
        await run(() => this.attendance.ping(organizationId));
        return { ok: true, message: 'El Sistema de Asistencia respondió correctamente' };
      }
      case 'telegram': {
        const cfg = this.settings.forOrganization(organizationId, 'telegram');
        requireReady(!!cfg.botToken, 'Telegram');
        const me = await run(() => this.telegram.getMe(organizationId));
        const mismatch = cfg.botUsername && cfg.botUsername.toLowerCase() !== me.result.username.toLowerCase();
        return { ok: !mismatch, message: mismatch ? `El token pertenece a @${me.result.username}, no a @${cfg.botUsername}` : `Bot conectado: @${me.result.username}` };
      }
      default:
        throw new BadRequestException('Esta sección no tiene prueba de conexión');
    }
  }

  /** Registra en Telegram la URL del webhook de esta institución con su secreto. */
  @Post('telegram/register-webhook') @HttpCode(200)
  async registerTelegramWebhook(@Param('organizationId', ParseUUIDPipe) organizationId: string, @Req() request: AuthedRequest) {
    await this.access.assert(organizationId, request.user?.accountId);
    const cfg = this.settings.forOrganization(organizationId, 'telegram');
    requireReady(!!cfg.botToken, 'Telegram');
    if (!cfg.webhookSecret) throw new BadRequestException('Define y guarda el secreto del webhook antes de registrarlo');
    const url = this.settings.describe(organizationId).find((item) => item.key === 'telegram')!.endpoints.webhook;
    if (url.includes('localhost')) throw new BadRequestException('Telegram necesita una URL pública de la API (API_PUBLIC_URL)');
    await run(() => this.telegram.setWebhook(organizationId, url));
    return { ok: true, message: `Webhook registrado en ${url}` };
  }
}

@Module({ controllers: [PlatformSettingsController, OrganizationIntegrationSettingsController] })
export class PlatformSettingsAdminModule {}
