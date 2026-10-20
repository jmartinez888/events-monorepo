import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { EventsService } from './events.service.js';
import { Actor, EventAccessService } from '../../common/event-access.service.js';
import { PrismaService } from '../../database/prisma.service.js';

class CreateEventDto { @IsString() @MinLength(2) eventName!: string; @IsDateString() startDate!: string; @IsUUID() organizationId!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsString() coverUrl?: string; @IsOptional() @IsString() logoUrl?: string; @IsOptional() @IsString() contactEmail?: string; @IsOptional() @IsString() status?: string; }
class InheritDto { @IsUUID() sourceEventId!: string; @IsUUID() targetEditionId!: string; }

type Authed = { user: Actor };

/** Cada ruta comprueba el permiso sobre el evento u organización según la base de datos. */
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService, private readonly access: EventAccessService, private readonly prisma: PrismaService) {}

  @Get() async list(@Req() r: Authed, @Query('organizationId') organizationId?: string) {
    await this.access.assertOrganization(organizationId || null, r.user, 'READ');
    return this.events.list(organizationId);
  }
  @Get(':id/contacts') async contacts(@Param('id') id: string, @Req() r: Authed) { await this.access.assertEvent(id, r.user, 'READ'); return this.events.contacts(id); }
  @Get(':id/attendees/export') async attendeeExport(@Param('id') id: string, @Req() r: Authed) { await this.access.assertEvent(id, r.user, 'READ'); return this.events.attendeeExport(id); }
  @Get(':id/attendees') async attendees(@Param('id') id: string, @Req() r: Authed, @Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) { await this.access.assertEvent(id, r.user, 'READ'); return this.events.attendees(id, Number(page) || 1, Number(limit) || 20, search); }
  @Post(':id/contacts') async addContact(@Param('id') id: string, @Body() body: { name: string; email?: string; phone?: string; role?: string }, @Req() r: Authed) { await this.access.assertEvent(id, r.user, 'EDIT'); return this.events.addContact(id, { name: body.name, email: body.email, phone: body.phone, role: body.role }); }
  @Patch('contacts/:contactId') async updateContact(@Param('contactId') id: string, @Body() body: { name?: string; email?: string; phone?: string; role?: string }, @Req() r: Authed) { await this.assertContact(id, r.user); return this.events.updateContact(id, body); }
  @Delete('contacts/:contactId') async removeContact(@Param('contactId') id: string, @Req() r: Authed) { await this.assertContact(id, r.user); return this.events.removeContact(id); }
  @Get(':id/setup') async setup(@Param('id') id: string, @Req() r: Authed) { await this.access.assertEvent(id, r.user, 'READ'); return this.events.getSetup(id); }
  @Patch(':id/setup') async updateSetup(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() r: Authed) { await this.access.assertEvent(id, r.user, 'EDIT'); return this.events.updateSetup(id, body); }
  @Post(':id/setup/complete') async completeSetup(@Param('id') id: string, @Req() r: Authed) { await this.access.assertEvent(id, r.user, 'EDIT'); return this.events.completeSetup(id); }
  @Post(':id/inherit-speakers') async inheritSpeakers(@Param('id') id: string, @Body() body: InheritDto, @Req() r: Authed) {
    await this.access.assertEvent(id, r.user, 'EDIT');
    await this.access.assertEvent(body.sourceEventId, r.user, 'READ');
    return this.events.inheritSpeakers(id, body.sourceEventId, body.targetEditionId);
  }
  @Get(':id') async get(@Param('id') id: string, @Req() r: Authed) { await this.access.assertEvent(id, r.user, 'READ'); return this.events.get(id); }
  @Post() async create(@Body() dto: CreateEventDto, @Req() r: Authed) { await this.access.assertOrganization(dto.organizationId, r.user, 'EDIT'); return this.events.create(dto); }
  @Patch(':id') async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() r: Authed) {
    await this.access.assertEvent(id, r.user, 'EDIT');
    // Mover un evento a otra organización exige permisos en ambas.
    if (typeof body.organizationId === 'string') await this.access.assertOrganization(body.organizationId, r.user, 'MANAGE');
    return this.events.update(id, body);
  }
  @Delete(':id') async remove(@Param('id') id: string, @Req() r: Authed) {
    await this.access.assertManager(id, r.user);
    if (await this.prisma.participantCertificate.count({ where: { participant: { edition: { mainEventId: id } }, status: 'ISSUED' } })) throw new BadRequestException('El evento tiene certificados emitidos; revócalos antes de eliminarlo');
    return this.events.remove(id);
  }

  private async assertContact(contactId: string, actor: Actor) {
    const contact = await this.prisma.eventContact.findUnique({ where: { id: contactId }, select: { eventId: true } });
    if (!contact) throw new NotFoundException('Contacto no encontrado');
    await this.access.assertEvent(contact.eventId, actor, 'EDIT');
  }
}
