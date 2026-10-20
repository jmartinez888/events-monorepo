import { Module } from '@nestjs/common';
import { EventContentController } from './event-content.controller.js';
import { EventContentService } from './event-content.service.js';
import { RolesService } from './roles.service.js';
import { EventAccessModule } from '../../common/event-access.module.js';
import { DirectoryModule } from '../directory/directory.module.js';
@Module({ imports: [EventAccessModule, DirectoryModule], controllers: [EventContentController], providers: [EventContentService, RolesService] })
export class EventContentModule {}
