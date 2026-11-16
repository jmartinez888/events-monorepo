import { Global, Module } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service.js';
import { OrganizationAdminGuard, OrganizationMemberGuard, OrganizationSettingsAccess } from './organization-access.js';

/** Configuración (correo del sistema e integraciones por institución) que leen los demás módulos. */
@Global()
@Module({
  providers: [PlatformSettingsService, OrganizationSettingsAccess, OrganizationAdminGuard, OrganizationMemberGuard],
  exports: [PlatformSettingsService, OrganizationSettingsAccess, OrganizationAdminGuard, OrganizationMemberGuard],
})
export class PlatformSettingsModule {}
