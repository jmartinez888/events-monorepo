import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ResendWebhooksService } from './resend-webhooks.service.js';
import { OrganizationAdminGuard } from '../platform-settings/organization-access.js';

@UseGuards(OrganizationAdminGuard)
@Controller('organizations/:organizationId/email-settings/resend-webhooks')
export class ResendWebhooksController {
  constructor(private readonly service: ResendWebhooksService) {}

  @Get() list(@Param('organizationId') org: string) { return this.service.list(org); }
  @Post() create(@Param('organizationId') org: string, @Body() body: { events?: string[]; endpoint?: string }) { return this.service.create(org, body); }
  @Get(':webhookId') get(@Param('organizationId') org: string, @Param('webhookId') id: string) { return this.service.get(org, id); }
  @Patch(':webhookId') update(@Param('organizationId') org: string, @Param('webhookId') id: string, @Body() body: any) { return this.service.update(org, id, body); }
  @Delete(':webhookId') remove(@Param('organizationId') org: string, @Param('webhookId') id: string) { return this.service.remove(org, id); }
  @Post(':webhookId/rotate-secret') rotate(@Param('organizationId') org: string, @Param('webhookId') id: string) { return this.service.rotateSecret(org, id); }
  @Get(':webhookId/events') events(@Param('organizationId') org: string, @Param('webhookId') id: string, @Query('limit') limit?: string, @Query('after') after?: string) { return this.service.listEvents(org, id, limit ? Number(limit) : undefined, after); }
  @Get(':webhookId/events/:eventId') event(@Param('organizationId') org: string, @Param('webhookId') id: string, @Param('eventId') eventId: string) { return this.service.getEvent(org, id, eventId); }
  @Get(':webhookId/events/:eventId/attempts') attempts(@Param('organizationId') org: string, @Param('webhookId') id: string, @Param('eventId') eventId: string) { return this.service.listAttempts(org, id, eventId); }
  @Post(':webhookId/events/:eventId/replay') replay(@Param('organizationId') org: string, @Param('webhookId') id: string, @Param('eventId') eventId: string) { return this.service.replayEvent(org, id, eventId); }
}
