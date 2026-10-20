import { Module } from '@nestjs/common';
import { EventAccessModule } from '../../common/event-access.module.js';
import { EventFilesController } from './event-files.controller.js';
import { EventFilesService } from './event-files.service.js';

@Module({ imports: [EventAccessModule], controllers: [EventFilesController], providers: [EventFilesService], exports: [EventFilesService] })
export class EventFilesModule {}
