import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CertificatesService } from './certificates.service.js';
import { Public } from '../../common/public.decorator.js';
import { Actor } from '../../common/event-access.service.js';

class IssueCertificateDto { @IsUUID() participantId!: string; @IsOptional() @IsUUID() templateId?: string; }
class IssueBulkDto {
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ArrayUnique() @IsUUID('all', { each: true }) participantIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID('all', { each: true }) roleIds?: string[];
  @IsOptional() @IsUUID() templateId?: string;
}
class ReasonDto { @IsOptional() @IsString() @MaxLength(500) reason?: string; }
class UpdateCertificateDto { @IsOptional() @IsIn(['ISSUED', 'REVOKED']) status?: 'ISSUED' | 'REVOKED'; @IsOptional() @IsString() @MaxLength(500) reason?: string; }
class DirectApprovalDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ArrayUnique() @IsUUID('all', { each: true }) participantIds!: string[];
  @IsUUID() roleId!: string;
  @IsBoolean() approved!: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
class TemplateDto { @IsString() @MinLength(1) @MaxLength(200) name!: string; @IsOptional() design?: unknown; }
class LogDto { @IsString() @MinLength(1) @MaxLength(50) action!: string; @IsOptional() @IsString() @MaxLength(64) ipAddress?: string; }

type Authed = { user: Actor };

@Controller()
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('certificates') list(@Req() request: Authed, @Query('participantId') participantId?: string) { return this.certificates.list(participantId, request.user); }
  @Public() @Get('certificates/verify/:code') verify(@Param('code') code: string) { return this.certificates.verify(code); }
  @Post('certificates') issue(@Body() dto: IssueCertificateDto, @Req() request: Authed) { return this.certificates.issue(dto.participantId, dto.templateId, request.user); }
  @Get('certificates/templates') templates() { return this.certificates.templates(); }
  @Post('certificates/templates') createTemplate(@Body() dto: TemplateDto) { return this.certificates.createTemplate(dto); }
  @Patch('certificates/templates/:id') updateTemplate(@Param('id') id: string, @Body() dto: TemplateDto) { return this.certificates.updateTemplate(id, dto); }
  @Delete('certificates/templates/:id') removeTemplate(@Param('id') id: string) { return this.certificates.removeTemplate(id); }
  @Get('certificates/:id/logs') logs(@Param('id') id: string) { return this.certificates.logs(id); }
  @Post('certificates/:id/logs') addLog(@Param('id') id: string, @Body() dto: LogDto) { return this.certificates.addLog(id, dto.action, dto.ipAddress); }
  @Patch('certificates/:id') update(@Param('id') id: string, @Body() dto: UpdateCertificateDto, @Req() request: Authed) { return this.certificates.update(id, dto, request.user); }
  @Post('certificates/:id/revoke') revoke(@Param('id') id: string, @Body() dto: ReasonDto, @Req() request: Authed) { return this.certificates.revoke(id, dto.reason, request.user); }
  @Post('certificates/:id/reissue') reissue(@Param('id') id: string, @Body() dto: ReasonDto, @Req() request: Authed) { return this.certificates.reissue(id, dto.reason, request.user); }
  @Post('certificates/:id/retry') retry(@Param('id') id: string, @Req() request: Authed) { return this.certificates.retryFailed(id, request.user); }

  @Get('events/:eventId/certificates') forEvent(@Param('eventId') eventId: string, @Req() request: Authed) { return this.certificates.listForEvent(eventId, request.user); }
  @Post('events/:eventId/certificates/issue') issueBulk(@Param('eventId') eventId: string, @Body() dto: IssueBulkDto, @Req() request: Authed) { return this.certificates.issueBulk(eventId, dto, request.user); }
  @Post('events/:eventId/role-approvals') directApproval(@Param('eventId') eventId: string, @Body() dto: DirectApprovalDto, @Req() request: Authed) { return this.certificates.directApproval(eventId, dto, request.user); }
}
