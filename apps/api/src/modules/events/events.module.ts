import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { EventAccessModule } from '../../common/event-access.module.js';

@Module({ imports: [EventAccessModule], controllers: [EventsController], providers: [EventsService] })
export class EventsModule {}
