import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';
import { DirectoryModule } from '../directory/directory.module.js';

@Module({ imports: [DirectoryModule], controllers: [ProfilesController], providers: [ProfilesService, PrismaService] })
export class ProfilesModule {}
