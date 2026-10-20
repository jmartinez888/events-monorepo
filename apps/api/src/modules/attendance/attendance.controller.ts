import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AttendanceService } from './attendance.service.js';
import { Actor } from '../../common/event-access.service.js';

class BulkAttendanceDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true }) participantIds!: string[];
  @IsBoolean() valid!: boolean;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@Controller('events/:eventId/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}
  @Get() list(@Param('eventId') id: string, @Req() request: { user: Actor }) { return this.attendance.list(id, request.user); }
  @Post('bulk') approveBulk(@Param('eventId') id: string, @Body() dto: BulkAttendanceDto, @Req() request: { user: Actor }) { return this.attendance.approveBulk(id, dto, request.user); }
}
