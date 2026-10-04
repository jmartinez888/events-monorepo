import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';
import { CommissionAccessGuard, CommissionResource } from './commission-access.guard.js';
import { AgendaDto, AttendanceDto, DocumentDto, MinuteDto, SessionDto, UpdateSessionDto } from './commission.dto.js';

@Controller('commission/sessions')
@CommissionResource('sessions')
@UseGuards(CommissionAccessGuard)
export class SessionsController {
  constructor(private readonly service: SessionsService) {}

  @Get()
  list(@Query('organizationId') organizationId: string, @Query('year', new ParseIntPipe({ optional: true })) year?: number) {
    return this.service.list(organizationId, year);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: SessionDto) {
    return this.service.create(body.organizationId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateSessionDto) {
    return this.service.update(id, { ...body });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ── Agenda ──────────────────────────────────────────────────────

  @Post(':id/agenda')
  addAgendaItem(@Param('id') sessionId: string, @Body() body: AgendaDto) {
    return this.service.addAgendaItem(sessionId, body);
  }

  @Delete('agenda/:itemId')
  removeAgendaItem(@Param('itemId') id: string) {
    return this.service.removeAgendaItem(id);
  }

  // ── Attendance ──────────────────────────────────────────────────

  @Put(':id/attendance/:institutionId')
  setAttendance(
    @Param('id') sessionId: string,
    @Param('institutionId') institutionId: string,
    @Body() body: AttendanceDto,
  ) {
    return this.service.setAttendance(sessionId, institutionId, body);
  }

  // ── Minutes ─────────────────────────────────────────────────────

  @Put(':id/minute')
  upsertMinute(@Param('id') sessionId: string, @Body() body: MinuteDto) {
    return this.service.upsertMinute(sessionId, body);
  }

  // ── Documents ───────────────────────────────────────────────────

  @Post(':id/documents')
  addDocument(@Param('id') sessionId: string, @Body() body: DocumentDto) {
    return this.service.addDocument(sessionId, body);
  }

  @Delete('documents/:docId')
  removeDocument(@Param('docId') id: string) {
    return this.service.removeDocument(id);
  }
}
