import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Prisma } from '@prisma/client';
import { IntegrationsService } from './integrations.service.js';
import { SessionSyncService } from './session-sync.service.js';
import { ZoomClient } from './providers/zoom.client.js';
import { AttendanceClient, AttendanceAttendee } from './providers/attendance.client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Actor } from '../../common/event-access.service.js';
import { Public } from '../../common/public.decorator.js';

class SettingsDto {
  @IsOptional() @IsIn(['MANUAL', 'AUTOMATIC']) virtualAttendanceMode?: 'MANUAL' | 'AUTOMATIC';
  @IsOptional() @IsNumber() @Min(0) @Max(1) attendanceThreshold?: number;
  @IsOptional() @IsInt() @Min(1) capacity?: number | null;
  @IsOptional() @IsBoolean() waitlistEnabled?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsInt({ each: true }) reminderOffsets?: number[];
  @IsOptional() @IsBoolean() zoomEnabled?: boolean;
  @IsOptional() @IsBoolean() facebookLiveEnabled?: boolean;
  @IsOptional() @IsBoolean() attendanceMirrorEnabled?: boolean;
}

class OnsitePersonDto {
  @IsString() @MinLength(1) @MaxLength(120) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(120) lastName!: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(20) documentType?: string;
  @IsOptional() @IsString() @MaxLength(30) documentNumber?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}
class OnsiteRegistrationDto {
  @IsOptional() @IsString() @MaxLength(100) attendanceEventId?: string;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsObject() @ValidateNested() @Type(() => OnsitePersonDto) person!: OnsitePersonDto;
}

type RawRequest = { rawBody?: Buffer; body: any };

@Controller()
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('events/:eventId/integrations') overview(@Param('eventId') eventId: string, @Req() request: { user: Actor }) { return this.integrations.overview(eventId, request.user); }
  @Patch('events/:eventId/settings') settings(@Param('eventId') eventId: string, @Body() dto: SettingsDto, @Req() request: { user: Actor }) { return this.integrations.updateSettings(eventId, dto, request.user); }
  @Post('events/:eventId/integrations/sync') sync(@Param('eventId') eventId: string, @Req() request: { user: Actor }) { return this.integrations.syncNow(eventId, request.user); }
  @Post('sessions/:sessionId/zoom/import-attendance') importZoom(@Param('sessionId') sessionId: string, @Req() request: { user: Actor }) { return this.integrations.importZoom(sessionId, request.user); }
  @Post('sessions/:sessionId/attendance/reconcile') reconcile(@Param('sessionId') sessionId: string, @Req() request: { user: Actor }) { return this.integrations.reconcileAttendance(sessionId, request.user); }
  @Get('sessions/:sessionId/zoom/start-url') startUrl(@Param('sessionId') sessionId: string, @Req() request: { user: Actor }) { return this.integrations.hostStartUrl(sessionId, request.user); }
  @Post('integration-jobs/:id/retry') retry(@Param('id') id: string, @Req() request: { user: Actor }) { return this.integrations.retryJob(id, request.user); }
}

/** Entradas de sistemas externos. Cada una verifica su firma y descarta reenvíos. */
@Controller()
export class IntegrationWebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly sync: SessionSyncService,
    private readonly zoom: ZoomClient,
    private readonly attendanceApi: AttendanceClient,
  ) {}

  /** Cada institución registra en Zoom su propia URL: /webhooks/zoom/<id de la institución>. */
  @Public() @Post('webhooks/zoom/:organizationId') @HttpCode(200)
  async zoomWebhook(@Param('organizationId', ParseUUIDPipe) organizationId: string, @Req() request: RawRequest, @Headers('x-zm-request-timestamp') timestamp?: string, @Headers('x-zm-signature') signature?: string) {
    const raw = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body);
    if (!this.zoom.verifyWebhook(organizationId, raw, timestamp, signature)) throw new ForbiddenException('Firma inválida');
    const body = request.body ?? {};
    if (body.event === 'endpoint.url_validation') return this.zoom.urlValidation(organizationId, String(body.payload?.plainToken ?? ''));
    const object = body.payload?.object ?? {};
    const externalId = `${organizationId}:${body.event}:${object.uuid ?? object.id}:${body.event_ts ?? timestamp}`;
    if (!(await this.receipt('zoom', externalId, String(body.event), body))) return { duplicate: true };
    const meetingId = String(object.id ?? '');
    const result = body.event === 'meeting.ended' ? await this.integrations.onZoomMeetingEnded(organizationId, meetingId)
      : body.event === 'meeting.updated' ? await this.integrations.onZoomMeetingUpdated(organizationId, meetingId)
      : { ignored: true };
    await this.prisma.webhookReceipt.update({ where: { provider_externalId: { provider: 'zoom', externalId } }, data: { processedAt: new Date() } });
    return result;
  }

  /** Marca en tiempo real desde Asistencia: { event_id, attendee: { id, user_name, user_email, document_number } }. */
  @Public() @Post('webhooks/attendance/:organizationId') @HttpCode(200)
  async attendanceWebhook(@Param('organizationId', ParseUUIDPipe) organizationId: string, @Req() request: RawRequest, @Headers('x-attendance-signature') signature?: string) {
    const raw = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body);
    if (!this.attendanceApi.verifyWebhook(organizationId, raw, signature)) throw new ForbiddenException('Firma inválida');
    const eventId = String(request.body?.event_id ?? '');
    const attendee = request.body?.attendee as AttendanceAttendee | undefined;
    if (!eventId || !attendee?.id) return { ignored: true };
    const externalId = `${organizationId}:${eventId}:${attendee.id}`;
    if (!(await this.receipt('attendance', externalId, 'attendance.recorded', request.body))) return { duplicate: true };
    // Solo se aceptan marcas de espejos que pertenecen a la institución firmante.
    const integration = await this.prisma.sessionIntegration.findFirst({ where: { attendanceEventId: eventId, session: { activity: { edition: { mainEvent: { organizationId } } } } } });
    if (!integration) return { matched: false };
    const session = await this.sync.load(integration.sessionId);
    const participantId = await this.sync.recordAttendee(session, attendee);
    await this.prisma.webhookReceipt.update({ where: { provider_externalId: { provider: 'attendance', externalId } }, data: { processedAt: new Date() } });
    return { matched: true, registrationId: participantId };
  }

  /** Asistencia pide registrar a una persona nueva; nunca escribe directo al Directorio (flujo 03 §4). */
  @Public() @Post('integrations/attendance/:organizationId/person-registrations') @HttpCode(200)
  async onsiteRegistration(@Param('organizationId', ParseUUIDPipe) organizationId: string, @Body() dto: OnsiteRegistrationDto, @Headers('x-service-key') key?: string) {
    if (!this.attendanceApi.verifyServiceKey(organizationId, key)) throw new ForbiddenException('Clave de servicio inválida');
    return this.sync.registerOnsitePerson(organizationId, dto);
  }

  /** Devuelve false si el proveedor ya envió este mensaje. */
  private async receipt(provider: string, externalId: string, eventType: string, payload: unknown) {
    try {
      await this.prisma.webhookReceipt.create({ data: { provider, externalId: externalId.slice(0, 300), eventType, payload: payload as Prisma.InputJsonValue } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }
}
