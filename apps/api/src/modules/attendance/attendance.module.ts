import { Module } from '@nestjs/common';
import { EventAccessModule } from '../../common/event-access.module.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({ imports: [EventAccessModule], controllers: [AttendanceController], providers: [AttendanceService], exports: [AttendanceService] })
export class AttendanceModule {}
