import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InstitutionsService } from './institutions.service.js';

@Controller('commission/institutions')
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
  create(@Body() body: Record<string, any>) {
    return this.service.create(body.organizationId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
