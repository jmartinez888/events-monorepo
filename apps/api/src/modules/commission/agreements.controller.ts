import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AgreementsService } from './agreements.service.js';

@Controller('commission/agreements')
export class AgreementsController {
  constructor(private readonly service: AgreementsService) {}

  @Get('stats')
  stats(@Query('organizationId') organizationId: string) {
    return this.service.stats(organizationId);
  }

  @Get()
  list(
    @Query('organizationId') organizationId: string,
    @Query('institutionId') institutionId?: string,
    @Query('status') status?: string,
    @Query('year') year?: string,
  ) {
    return this.service.list(organizationId, {
      institutionId,
      status,
      year: year ? Number(year) : undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: Record<string, any>) {
    return this.service.create(body.sessionId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ── Evidences ───────────────────────────────────────────────────

  @Post(':id/evidences')
  addEvidence(@Param('id') agreementId: string, @Body() body: Record<string, any>) {
    return this.service.addEvidence(agreementId, body);
  }

  @Delete('evidences/:evidenceId')
  removeEvidence(@Param('evidenceId') id: string) {
    return this.service.removeEvidence(id);
  }
}
