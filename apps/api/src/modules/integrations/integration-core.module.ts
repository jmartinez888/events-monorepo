import { Global, Module } from '@nestjs/common';
import { IntegrationJobsService } from './integration-jobs.service.js';
import { ZoomClient } from './providers/zoom.client.js';
import { FacebookClient } from './providers/facebook.client.js';
import { AttendanceClient } from './providers/attendance.client.js';
import { CertificatesClient } from './providers/certificates.client.js';
import { TelegramClient } from './providers/telegram.client.js';

/** Cola durable y clientes de proveedores externos, compartidos por todos los módulos. */
@Global()
@Module({
  providers: [IntegrationJobsService, ZoomClient, FacebookClient, AttendanceClient, CertificatesClient, TelegramClient],
  exports: [IntegrationJobsService, ZoomClient, FacebookClient, AttendanceClient, CertificatesClient, TelegramClient],
})
export class IntegrationCoreModule {}
