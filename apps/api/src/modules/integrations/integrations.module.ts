import { Module } from '@nestjs/common';
import { IntegrationsController, IntegrationWebhooksController } from './integrations.controller.js';
import { IntegrationsService } from './integrations.service.js';
import { SessionSyncService } from './session-sync.service.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { RegistrationsModule } from '../registrations/registrations.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EventAccessModule } from '../../common/event-access.module.js';

@Module({
  imports: [AttendanceModule, RegistrationsModule, NotificationsModule, EventAccessModule],
  controllers: [IntegrationsController, IntegrationWebhooksController],
  providers: [IntegrationsService, SessionSyncService],
  exports: [SessionSyncService],
})
export class IntegrationsModule {}
