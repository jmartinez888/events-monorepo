import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { EventFilesService, MAX_FILE_BYTES } from './event-files.service.js';
import { Actor } from '../../common/event-access.service.js';
import { Public } from '../../common/public.decorator.js';

class UploadDto {
  @IsIn(['MATERIAL', 'DOCUMENT']) scope!: 'MATERIAL' | 'DOCUMENT';
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsIn(['PUBLIC', 'REGISTERED', 'PRIVATE']) visibility?: 'PUBLIC' | 'REGISTERED' | 'PRIVATE';
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsUUID() sessionSpeakerId?: string;
  @IsOptional() @IsString() @MaxLength(30) documentType?: string;
}
class UpdateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsIn(['PUBLIC', 'REGISTERED', 'PRIVATE']) visibility?: 'PUBLIC' | 'REGISTERED' | 'PRIVATE';
  @IsOptional() @IsIn(['ACTIVE', 'HIDDEN', 'DELETED']) status?: 'ACTIVE' | 'HIDDEN' | 'DELETED';
}

const upload = FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

@Controller()
export class EventFilesController {
  constructor(private readonly files: EventFilesService) {}

  @Get('events/:eventId/files') list(@Param('eventId') eventId: string, @Req() request: { user: Actor }) { return this.files.list(eventId, request.user); }
  @Post('events/:eventId/files') @UseInterceptors(upload) upload(@Param('eventId') eventId: string, @UploadedFile() file: Express.Multer.File, @Body() dto: UploadDto, @Req() request: { user: Actor }) { return this.files.upload(eventId, file, dto, request.user); }
  @Post('event-files/:id/versions') @UseInterceptors(upload) replace(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() request: { user: Actor }) { return this.files.replace(id, file, request.user); }
  @Patch('event-files/:id') update(@Param('id') id: string, @Body() dto: UpdateDto, @Req() request: { user: Actor }) { return this.files.update(id, dto, request.user); }
  @Get('event-files/:id/download') download(@Param('id') id: string, @Req() request: { user: Actor }, @Query('version', new ParseIntPipe({ optional: true })) version?: number) { return this.files.downloadForActor(id, request.user, version); }
  @Get('me/speaker-sessions') speakerSessions(@Req() request: { user: Actor }) { return this.files.mySpeakerSessions(request.user); }

  /** Descarga con URL firmada temporal: no requiere sesión, el token es la autorización. */
  @Public() @Get('files/:token')
  async serve(@Param('token') token: string, @Res() response: Response) {
    const file = await this.files.resolveDownload(token);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (file.size) response.setHeader('Content-Length', String(file.size));
    file.body.on('error', () => response.destroy());
    file.body.pipe(response);
  }
}
