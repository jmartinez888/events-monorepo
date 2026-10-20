import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EventContentService } from './event-content.service.js';
import { RolesService } from './roles.service.js';
import { Actor } from '../../common/event-access.service.js';
class RoleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsUUID() mainEventId?: string;
  @IsOptional() @IsUUID() editionId?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) displayName?: string;
  @IsOptional() @IsString() @MaxLength(120) displayNameEn?: string | null;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) badgeColor?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isSpeaker?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) certificateHours?: number;
  @IsOptional() @IsBoolean() requiresAttendance?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) certificateText?: string | null;
  @IsOptional() @IsString() @MaxLength(200) externalTemplateId?: string | null;
}
class ActivityDto { @IsString() @MinLength(2) title!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsString() startsAt?: string; @IsOptional() @IsString() endsAt?: string; }
class UpdateActivityDto { @IsOptional() @IsString() @MinLength(2) title?: string; @IsOptional() @IsString() description?: string | null; @IsOptional() @IsString() startsAt?: string | null; @IsOptional() @IsString() endsAt?: string | null; }
class SessionDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() startsAt?: string | null;
  @IsOptional() @IsString() endsAt?: string | null;
  @IsOptional() @IsIn(['PHYSICAL', 'ONLINE', 'HYBRID']) modality?: 'PHYSICAL' | 'ONLINE' | 'HYBRID' | null;
}
class UpdateSessionDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() startsAt?: string | null;
  @IsOptional() @IsString() endsAt?: string | null;
  @IsOptional() @IsIn(['PHYSICAL', 'ONLINE', 'HYBRID']) modality?: 'PHYSICAL' | 'ONLINE' | 'HYBRID' | null;
}
class SpeakerDto { @IsUUID() profileId!: string; @IsOptional() @IsIn(['SPEAKER', 'CO_SPEAKER', 'MODERATOR']) role?: 'SPEAKER' | 'CO_SPEAKER' | 'MODERATOR'; @IsOptional() @IsString() @MaxLength(300) topic?: string; }
class SessionSpeakerDto { @IsOptional() @IsIn(['SPEAKER', 'CO_SPEAKER', 'MODERATOR']) role?: 'SPEAKER' | 'CO_SPEAKER' | 'MODERATOR'; @IsOptional() @IsString() @MaxLength(300) topic?: string | null; }
class CreateSpeakerDto {
  @IsUUID() editionId!: string;
  @IsOptional() @IsUUID() profileId?: string | null;
  @IsUUID() roleId!: string;
  @IsString() @MinLength(1) @MaxLength(120) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(120) lastName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(5000) bio?: string;
  @IsOptional() @IsString() @MaxLength(30) identityDocumentType?: string;
  @IsOptional() @IsString() @MaxLength(30) identityDocumentNumber?: string;
}
class UpdateSpeakerDto { @IsOptional() @IsString() @MaxLength(120) firstName?: string; @IsOptional() @IsString() @MaxLength(120) lastName?: string; @IsOptional() @IsString() @MaxLength(5000) bio?: string; }
class TicketDto { @IsString() @MinLength(2) name!: string; @IsNumber() price!: number; @IsOptional() @IsNumber() capacity?: number; }
class UpdateTicketDto { @IsOptional() @IsString() @MinLength(2) name?: string; @IsOptional() @IsNumber() price?: number; @IsOptional() @IsNumber() capacity?: number | null; }
class LineDto { @IsString() @MinLength(2) name!: string; @IsOptional() @IsString() description?: string; }
class UpdateLineDto { @IsOptional() @IsString() @MinLength(2) name?: string; @IsOptional() @IsString() description?: string | null; }
class ResourceDto { @IsString() @MinLength(1) @MaxLength(200) name!: string; @IsString() @MaxLength(2000) url!: string; @IsOptional() @IsString() @MaxLength(50) type?: string; }
class UpdateResourceDto { @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string; @IsOptional() @IsString() @MaxLength(2000) url?: string; @IsOptional() @IsString() @MaxLength(50) type?: string; }
class SessionLineDto { @IsUUID() thematicLineId!: string; }

type Authed = { user: Actor };

@Controller()
export class EventContentController {
  constructor(private readonly content: EventContentService, private readonly rolesService: RolesService) {}
  @Get('editions/:editionId/activities') activities(@Param('editionId') id: string, @Req() r: Authed) { return this.content.activities(id, r.user); }
  @Post('editions/:editionId/activities') createActivity(@Param('editionId') id: string, @Body() dto: ActivityDto, @Req() r: Authed) { return this.content.createActivity(id, dto, r.user); }
  @Patch('activities/:id') updateActivity(@Param('id') id: string, @Body() dto: UpdateActivityDto, @Req() r: Authed) { return this.content.updateActivity(id, dto, r.user); }
  @Delete('activities/:id') deleteActivity(@Param('id') id: string, @Req() r: Authed) { return this.content.deleteActivity(id, r.user); }
  @Get('activities/:activityId/sessions') sessions(@Param('activityId') id: string, @Req() r: Authed) { return this.content.sessions(id, r.user); }
  @Post('activities/:activityId/sessions') createSession(@Param('activityId') id: string, @Body() dto: SessionDto, @Req() r: Authed) { return this.content.createSession(id, dto, r.user); }
  @Post('editions/:editionId/sessions') createSessionForEdition(@Param('editionId') id: string, @Body() dto: SessionDto, @Req() r: Authed) { return this.content.createSessionForEdition(id, dto, r.user); }
  @Get('participants/:participantId/sessions') participantSessions(@Param('participantId') id: string, @Req() r: Authed) { return this.content.sessionsForParticipant(id, r.user); }
  @Patch('sessions/:id') updateSession(@Param('id') id: string, @Body() dto: UpdateSessionDto, @Req() r: Authed) { return this.content.updateSession(id, dto, r.user); }
  @Delete('sessions/:id') deleteSession(@Param('id') id: string, @Req() r: Authed) { return this.content.deleteSession(id, r.user); }
  @Post('sessions/:sessionId/speakers') addSpeaker(@Param('sessionId') id: string, @Body() dto: SpeakerDto, @Req() r: Authed) { return this.content.addSpeaker(id, dto, r.user); }
  @Patch('session-speakers/:id') updateSessionSpeaker(@Param('id') id: string, @Body() dto: SessionSpeakerDto, @Req() r: Authed) { return this.content.updateSessionSpeaker(id, dto, r.user); }
  @Delete('session-speakers/:id') removeSpeaker(@Param('id') id: string, @Req() r: Authed) { return this.content.removeSpeaker(id, r.user); }
  @Get('editions/:editionId/tickets') tickets(@Param('editionId') id: string, @Req() r: Authed) { return this.content.tickets(id, r.user); }
  @Post('editions/:editionId/tickets') createTicket(@Param('editionId') id: string, @Body() dto: TicketDto, @Req() r: Authed) { return this.content.createTicket(id, dto, r.user); }
  @Patch('tickets/:id') updateTicket(@Param('id') id: string, @Body() dto: UpdateTicketDto, @Req() r: Authed) { return this.content.updateTicket(id, dto, r.user); }
  @Delete('tickets/:id') deleteTicket(@Param('id') id: string, @Req() r: Authed) { return this.content.deleteTicket(id, r.user); }
  @Get('events/:eventId/thematic-lines') thematicLines(@Param('eventId') id: string, @Req() r: Authed) { return this.content.thematicLines(id, r.user); }
  @Post('events/:eventId/thematic-lines') createLine(@Param('eventId') id: string, @Body() dto: LineDto, @Req() r: Authed) { return this.content.createThematicLine(id, dto.name, dto.description, r.user); }
  @Patch('thematic-lines/:id') updateLine(@Param('id') id: string, @Body() dto: UpdateLineDto, @Req() r: Authed) { return this.content.updateThematicLine(id, dto, r.user); }
  @Delete('thematic-lines/:id') deleteLine(@Param('id') id: string, @Req() r: Authed) { return this.content.deleteThematicLine(id, r.user); }
  @Get('participant-roles') roles(@Req() r: Authed, @Query('mainEventId') mainEventId?: string, @Query('editionId') editionId?: string) { return this.content.roles(mainEventId, editionId, r.user); }
  @Post('participant-roles') createRole(@Body() dto: RoleDto, @Req() r: Authed) { return this.rolesService.create(dto, r.user); }
  @Patch('participant-roles/:id') updateRole(@Param('id') id: string, @Body() dto: RoleDto, @Req() r: Authed) { return this.rolesService.update(id, dto, r.user); }
  @Delete('participant-roles/:id') deleteRole(@Param('id') id: string, @Req() r: Authed) { return this.rolesService.remove(id, r.user); }
  @Get('events/:eventId/speakers') speakers(@Param('eventId') eventId: string, @Req() r: Authed, @Query('editionId') editionId?: string) { return this.content.speakers(eventId, editionId, r.user); }
  @Post('events/:eventId/speakers') createSpeaker(@Param('eventId') eventId: string, @Body() dto: CreateSpeakerDto, @Req() r: Authed) { return this.content.createSpeaker({ ...dto, eventId }, r.user); }
  @Patch('speakers/:id') updateSpeaker(@Param('id') id: string, @Body() dto: UpdateSpeakerDto, @Req() r: Authed) { return this.content.updateSpeaker(id, dto, r.user); }
  @Delete('speakers/:id') deleteSpeaker(@Param('id') id: string, @Req() r: Authed) { return this.content.deleteSpeaker(id, r.user); }
  @Get('sessions/:sessionId/resources') resources(@Param('sessionId') id: string, @Req() r: Authed) { return this.content.resources(id, r.user); }
  @Post('sessions/:sessionId/resources') addResource(@Param('sessionId') id: string, @Body() dto: ResourceDto, @Req() r: Authed) { return this.content.addResource(id, dto, r.user); }
  @Patch('resources/:id') updateResource(@Param('id') id: string, @Body() dto: UpdateResourceDto, @Req() r: Authed) { return this.content.updateResource(id, dto, r.user); }
  @Delete('resources/:id') removeResource(@Param('id') id: string, @Req() r: Authed) { return this.content.removeResource(id, r.user); }
  @Get('sessions/:sessionId/thematic-lines') sessionLines(@Param('sessionId') id: string, @Req() r: Authed) { return this.content.sessionLines(id, r.user); }
  @Post('sessions/:sessionId/thematic-lines') addSessionLine(@Param('sessionId') id: string, @Body() dto: SessionLineDto, @Req() r: Authed) { return this.content.addSessionLine(id, dto.thematicLineId, r.user); }
  @Delete('sessions/:sessionId/thematic-lines/:thematicLineId') removeSessionLine(@Param('sessionId') sessionId: string, @Param('thematicLineId') thematicLineId: string, @Req() r: Authed) { return this.content.removeSessionLine(sessionId, thematicLineId, r.user); }
}
