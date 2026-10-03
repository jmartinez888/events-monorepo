import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { InstitutionsController } from './institutions.controller.js';
import { InstitutionsService } from './institutions.service.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { AgreementsController } from './agreements.controller.js';
import { AgreementsService } from './agreements.service.js';
import { PublicCommissionController } from './public-commission.controller.js';
import { PublicCommissionService } from './public-commission.service.js';

@Module({
  controllers: [InstitutionsController, SessionsController, AgreementsController, PublicCommissionController],
  providers: [InstitutionsService, SessionsService, AgreementsService, PublicCommissionService, PrismaService],
})
export class CommissionModule {}
