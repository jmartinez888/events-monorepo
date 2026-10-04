import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AgreementStatus } from '@prisma/client';
import { AgreementsService } from './agreements.service.js';
import { CommissionAccessGuard, CommissionResource } from './commission-access.guard.js';
import { AgreementDto, EvidenceDto, UpdateAgreementDto } from './commission.dto.js';

@Controller('commission/agreements')
@CommissionResource('agreements')
@UseGuards(CommissionAccessGuard)
export class AgreementsController {
  constructor(private readonly service: AgreementsService) {}

  @Get('stats')
  stats(@Query('organizationId') organizationId: string) {
    return this.service.stats(organizationId);
  }

  @Get()
  list(
    @Query('organizationId') organizationId: string,
    @Query('institutionId', new ParseUUIDPipe({ optional: true })) institutionId?: string,
    @Query('status', new ParseEnumPipe(AgreementStatus, { optional: true })) status?: AgreementStatus,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.service.list(organizationId, {
      institutionId,
      status,
      year,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: AgreementDto) {
    return this.service.create(body.sessionId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateAgreementDto) {
    return this.service.update(id, { ...body });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ── Evidences ───────────────────────────────────────────────────

  @Post(':id/evidences')
  addEvidence(@Param('id') agreementId: string, @Body() body: EvidenceDto) {
    return this.service.addEvidence(agreementId, body);
  }

  @Delete('evidences/:evidenceId')
  removeEvidence(@Param('evidenceId') id: string) {
    return this.service.removeEvidence(id);
  }
}
