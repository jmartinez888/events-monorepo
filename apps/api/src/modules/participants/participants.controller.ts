import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ParticipantsService } from './participants.service.js';
class AddParticipantDto { @IsUUID() profileId!: string; @IsOptional() @IsUUID() roleId?: string; }
class UpdateParticipantDto { @IsBoolean() checkedIn!: boolean; }
class RoleDto { @IsUUID() roleId!: string; }
class RolesDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true }) roleIds!: string[]; }
class ManualParticipantDto { @IsOptional() @IsUUID() editionId?: string; @IsString() @MinLength(1) firstName!: string; @IsString() @MinLength(1) lastName!: string; @IsEmail() email!: string; @IsOptional() @IsString() identityDocumentType?: string | null; @IsOptional() @IsString() identityDocumentNumber?: string | null; @IsOptional() @IsUUID() roleId?: string; @IsOptional() @IsString() phone?: string; }
@Controller()
export class ParticipantsController {
  constructor(private readonly participants: ParticipantsService) {}
  @Get('editions/:editionId/participants') list(@Param('editionId') editionId: string, @Req() request: any) { return this.participants.list(editionId, request.user); }
  @Post('editions/:editionId/participants') add(@Param('editionId') editionId: string, @Body() dto: AddParticipantDto, @Req() request: any) { return this.participants.add(editionId, dto.profileId, dto.roleId, request.user); }
  @Post('events/:eventId/manual-participants') addManual(@Param('eventId') eventId: string, @Body() dto: ManualParticipantDto, @Req() request: any) { return this.participants.addManual(eventId, dto, request.user); }
  @Get('participants/:id') get(@Param('id') id: string, @Req() request: any) { return this.participants.get(id, request.user); }
  @Patch('participants/:id') update(@Param('id') id: string, @Body() body: UpdateParticipantDto, @Req() request: any) { return this.participants.update(id, body, request.user); }
  @Patch('participants/:id/role') changeRole(@Param('id') id: string, @Body() dto: RoleDto, @Req() request: any) { return this.participants.changeRole(id, dto.roleId, request.user); }
  @Patch('participants/:id/roles') setRoles(@Param('id') id: string, @Body() dto: RolesDto, @Req() request: any) { return this.participants.setRoles(id, dto.roleIds, request.user); }
  @Delete('participants/:id') remove(@Param('id') id: string, @Req() request: any) { return this.participants.remove(id, request.user); }
}
