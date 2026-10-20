import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { PublicEventsController } from './public-events.controller.js';
import { PublicEventsService } from './public-events.service.js';
import { EventFilesModule } from '../event-files/event-files.module.js';

@Module({ imports: [PrismaModule, EventFilesModule], controllers: [PublicEventsController], providers: [PublicEventsService] })
export class PublicEventsModule {}
