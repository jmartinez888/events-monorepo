import { BadRequestException, Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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

/** Administración > Configuración: solo SUPER_ADMIN. Los secretos nunca se devuelven. */
@UseGuards(AdminGuard)
@Controller('admin/settings')
export class PlatformSettingsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly zoom: ZoomClient,
    private readonly facebook: FacebookClient,
    private readonly attendance: AttendanceClient,
    private readonly telegram: TelegramClient,
  ) {}

  @Get()
  async list() {
    await this.settings.reload();
    return this.settings.describe();
  }

  @Patch(':section')
  update(@Param('section') section: string, @Body() dto: UpdateSectionDto, @Req() request: any) {
    return this.settings.update(section, dto, request.user?.accountId);
  }

  /** Prueba la configuración guardada contra el proveedor real. */
  @Post(':section/test') @HttpCode(200)
  async test(@Param('section') section: string, @Body() dto: TestSectionDto, @Req() request: any) {
    switch (section) {
      case 'mail': {
        const account = await this.prisma.authUser.findUnique({ where: { id: request.user?.accountId }, select: { email: true } });
        const recipient = dto.recipient || account?.email;
        if (!recipient) throw new BadRequestException('Indica un correo destinatario');
        const result = await this.mail.sendPlatformTest(recipient);
        if (!result.sent) throw new BadRequestException(result.reason || 'No se pudo enviar el correo de prueba');
        return { ok: true, message: `Correo de prueba enviado a ${recipient}` };
      }
      case 'zoom': {
        this.require(this.zoom.configured, 'Zoom');
        const user = await this.run(() => this.zoom.getHostUser());
        return { ok: true, message: `Conectado como ${[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || user.id}` };
      }
      case 'facebook': {
        this.require(this.facebook.configured, 'Facebook Live');
        const page = await this.run(() => this.facebook.getPage());
        return { ok: true, message: `Página conectada: ${page.name}` };
      }
      case 'attendance': {
        this.require(this.attendance.configured, 'el Sistema de Asistencia');
        await this.run(() => this.attendance.ping());
        return { ok: true, message: 'El Sistema de Asistencia respondió correctamente' };
      }
      case 'telegram': {
        this.require(!!this.settings.get('telegram').botToken, 'Telegram');
        const me = await this.run(() => this.telegram.getMe());
        const expected = this.settings.get('telegram').botUsername;
        const mismatch = expected && expected.toLowerCase() !== me.result.username.toLowerCase();
        return { ok: !mismatch, message: mismatch ? `El token pertenece a @${me.result.username}, no a @${expected}` : `Bot conectado: @${me.result.username}` };
      }
      default:
        throw new BadRequestException('Esta sección no tiene prueba de conexión');
    }
  }

  /** Registra en Telegram la URL del webhook de esta API con el secreto guardado. */
  @Post('telegram/register-webhook') @HttpCode(200)
  async registerTelegramWebhook() {
    this.require(!!this.settings.get('telegram').botToken, 'Telegram');
    if (!this.settings.get('telegram').webhookSecret) throw new BadRequestException('Define y guarda el secreto del webhook antes de registrarlo');
    const url = this.settings.describe().find((item) => item.key === 'telegram')!.endpoints.webhook;
    if (url.includes('localhost')) throw new BadRequestException('Telegram necesita una URL pública de la API (API_PUBLIC_URL)');
    await this.run(() => this.telegram.setWebhook(url));
    return { ok: true, message: `Webhook registrado en ${url}` };
  }

  private require(ready: boolean, name: string) {
    if (!ready) throw new BadRequestException(`Completa y guarda la configuración de ${name} antes de probarla`);
  }

  private async run<T>(call: () => Promise<T>) {
    try {
      return await call();
    } catch (error: any) {
      throw new BadRequestException(error?.message ?? 'El proveedor no respondió');
    }
  }
}

@Module({ controllers: [PlatformSettingsController] })
export class PlatformSettingsAdminModule {}
