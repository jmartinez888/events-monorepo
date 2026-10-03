import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/public.decorator.js';
import { PublicCommissionService } from './public-commission.service.js';

@Public()
@Controller('public/organizations/:organizationSlug/commission')
export class PublicCommissionController {
  constructor(private readonly service: PublicCommissionService) {}

  @Get('transparency')
  getTransparencyPortal(@Param('organizationSlug') slug: string) {
    return this.service.getTransparencyPortal(slug);
  }
}
