import { Body, Controller, Get, Module, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { RegistrationsService } from './registrations.service.js';
import { DirectoryModule } from '../directory/directory.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EventFilesModule } from '../event-files/event-files.module.js';
import { EventAccessModule } from '../../common/event-access.module.js';
import { Actor } from '../../common/event-access.service.js';
import { Public } from '../../common/public.decorator.js';
import { RateLimit } from '../../common/security/rate-limit.guard.js';

class PreferencesDto { @IsOptional() @IsIn(['EMAIL', 'TELEGRAM']) channel?: 'EMAIL' | 'TELEGRAM'; @IsOptional() @IsBoolean() remindersEnabled?: boolean; }

/** Página personal de la inscripción: el token único es la credencial. */
@Controller('public/registrations')
export class PublicRegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}
  @Public() @RateLimit('registration-token', 120, 15 * 60_000) @Get(':token') view(@Param('token') token: string) { return this.registrations.publicView(token); }
  @Public() @RateLimit('registration-token', 120, 15 * 60_000) @Patch(':token/preferences') preferences(@Param('token') token: string, @Body() dto: PreferencesDto) { return this.registrations.updatePreferences(token, dto); }
  @Public() @RateLimit('registration-token', 120, 15 * 60_000) @Post(':token/unsubscribe') unsubscribe(@Param('token') token: string) { return this.registrations.updatePreferences(token, { remindersEnabled: false }); }
  @Public() @RateLimit('registration-token', 30, 15 * 60_000) @Post(':token/cancel') cancel(@Param('token') token: string) { return this.registrations.cancelByToken(token); }
}

@Controller()
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}
  @Get('events/:eventId/registrations') list(@Param('eventId') eventId: string, @Req() request: { user: Actor }, @Query('status') status?: string, @Query('editionId') editionId?: string) { return this.registrations.listForEvent(eventId, request.user, { status, editionId }); }
  @Post('events/:eventId/registrations/promote-waitlist') promote(@Param('eventId') eventId: string, @Req() request: { user: Actor }) { return this.registrations.promoteWaitlistAsManager(eventId, request.user); }
  @Post('participants/:id/cancel') cancel(@Param('id') id: string, @Req() request: { user: Actor }) { return this.registrations.cancelByManager(id, request.user); }
  @Post('participants/:id/confirm') confirm(@Param('id') id: string, @Req() request: { user: Actor }) { return this.registrations.confirmByManager(id, request.user); }
}

@Module({
  imports: [DirectoryModule, NotificationsModule, EventFilesModule, EventAccessModule],
  controllers: [PublicRegistrationsController, RegistrationsController],
  providers: [RegistrationsService],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
