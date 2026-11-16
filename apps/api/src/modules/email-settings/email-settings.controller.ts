import { Controller, Get, Put, Post, Param, Body, UseGuards } from '@nestjs/common';
import { EmailSettingsService } from './email-settings.service.js';
import { UpdateEmailSettingsDto, TestEmailSettingsDto } from './email-settings.dto.js';
import { OrganizationAdminGuard, OrganizationMemberGuard } from '../platform-settings/organization-access.js';

/** Leer: cualquier miembro (las plantillas usan los remitentes). Cambiar o probar: OWNER/ADMIN. */
@Controller('organizations/:organizationId/email-settings')
export class EmailSettingsController {
  constructor(private readonly emailSettingsService: EmailSettingsService) {}

  @Get()
  @UseGuards(OrganizationMemberGuard)
  getSettings(@Param('organizationId') organizationId: string) {
    return this.emailSettingsService.getSettings(organizationId);
  }

  @Put()
  @UseGuards(OrganizationAdminGuard)
  updateSettings(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateEmailSettingsDto,
  ) {
    return this.emailSettingsService.updateSettings(organizationId, dto);
  }

  @Post('test')
  @UseGuards(OrganizationAdminGuard)
  testConnection(
    @Param('organizationId') organizationId: string,
    @Body() dto: TestEmailSettingsDto,
  ) {
    return this.emailSettingsService.testConnection(organizationId, dto);
  }
}
