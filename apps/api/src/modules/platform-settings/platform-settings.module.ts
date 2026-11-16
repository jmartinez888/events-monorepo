import { Global, Module } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service.js';

/** Configuración global (correo e integraciones) que leen los demás módulos. */
@Global()
@Module({
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
