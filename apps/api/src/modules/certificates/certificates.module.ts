import { Module } from '@nestjs/common';
import { CertificatesController } from './certificates.controller.js';
import { CertificatesService } from './certificates.service.js';
import { EventAccessModule } from '../../common/event-access.module.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({ imports: [EventAccessModule, AttendanceModule, NotificationsModule], controllers: [CertificatesController], providers: [CertificatesService], exports: [CertificatesService] })
export class CertificatesModule {}
