import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { InstitutionsService } from './institutions.service.js';
import { CommissionAccessGuard, CommissionResource } from './commission-access.guard.js';
import { InstitutionDto, UpdateInstitutionDto } from './commission.dto.js';

@Controller('commission/institutions')
@CommissionResource('institutions')
@UseGuards(CommissionAccessGuard)
export class InstitutionsController {
  constructor(private readonly service: InstitutionsService) {}

  @Get()
  list(@Query('organizationId') organizationId: string) {
    return this.service.list(organizationId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: InstitutionDto) {
    return this.service.create(body.organizationId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateInstitutionDto) {
    return this.service.update(id, { ...body });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
