import { Body, Controller, Get, Module, Param, Post, Query, Req } from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { DirectoryService } from './directory.service.js';
import { DirectoryReviewsService } from './directory-reviews.service.js';
import { EventAccessModule } from '../../common/event-access.module.js';
import { Actor } from '../../common/event-access.service.js';

class ResolveReviewDto { @IsIn(['KEEP_SEPARATE', 'MERGE']) action!: 'KEEP_SEPARATE' | 'MERGE'; @IsOptional() @IsUUID() targetProfileId?: string; }

@Controller('directory/reviews')
export class DirectoryReviewsController {
  constructor(private readonly reviews: DirectoryReviewsService) {}
  @Get() list(@Req() request: { user: Actor }, @Query('organizationId') organizationId?: string, @Query('status') status?: string) { return this.reviews.list(organizationId || undefined, status === 'RESOLVED' ? 'RESOLVED' : 'OPEN', request.user); }
  @Post(':id/resolve') resolve(@Param('id') id: string, @Body() dto: ResolveReviewDto, @Req() request: { user: Actor }) { return this.reviews.resolve(id, dto, request.user); }
}

@Module({ imports: [EventAccessModule], controllers: [DirectoryReviewsController], providers: [DirectoryService, DirectoryReviewsService], exports: [DirectoryService] })
export class DirectoryModule {}
