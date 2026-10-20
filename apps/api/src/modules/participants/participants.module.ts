import { Module } from '@nestjs/common';
import { ParticipantsController } from './participants.controller.js';
import { ParticipantsService } from './participants.service.js';
import { DirectoryModule } from '../directory/directory.module.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { EventAccessModule } from '../../common/event-access.module.js';
import { RegistrationsModule } from '../registrations/registrations.module.js';
@Module({ imports: [DirectoryModule, AttendanceModule, EventAccessModule, RegistrationsModule], controllers: [ParticipantsController], providers: [ParticipantsService] })
export class ParticipantsModule {}
