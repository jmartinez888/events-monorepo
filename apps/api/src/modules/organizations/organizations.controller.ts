import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { OrganizationsService } from './organizations.service.js';
import { AdminGuard } from '../auth/admin.guard.js';

class CreateOrganizationDto { @IsString() @MinLength(2) name!: string; @IsString() @MinLength(2) slug!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsString() organizationType?: string; }

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}
  @Get() list(@Req() request: any) { return this.organizations.list(request.user); }
  @Get(':id') get(@Param('id') id: string) { return this.organizations.get(id); }
  @Post() create(@Body() dto: CreateOrganizationDto, @Req() request: any) { return this.organizations.create(dto, request.user); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.organizations.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.organizations.remove(id); }
  @Get(':id/branches') branches(@Param('id') id: string) { return this.organizations.branches(id); }
  @Post(':id/branches') addBranch(@Param('id') id: string, @Body() body: any) { return this.organizations.addBranch(id, body); }
  @Patch('branches/:branchId') updateBranch(@Param('branchId') id: string, @Body() body: Record<string, unknown>) { return this.organizations.updateBranch(id, body); }
  @Delete('branches/:branchId') removeBranch(@Param('branchId') id: string) { return this.organizations.removeBranch(id); }
  @Get(':id/members') async members(@Param('id') id: string, @Req() request: any) { await this.organizations.access(id, request.user.accountId, ['SUPER_ADMIN', 'SAAS_ADMIN'].includes(request.user.role)); return this.organizations.members(id); }
  @Get(':id/access') access(@Param('id') id: string, @Req() request: any) { return this.organizations.access(id, request.user.accountId, ['SUPER_ADMIN', 'SAAS_ADMIN'].includes(request.user.role)); }
  @Post(':id/members') async addMember(@Param('id') id: string, @Body() body: any, @Req() request: any) { await this.organizations.assertCanManageMembers(id, request.user.accountId, request.user.role); return this.organizations.addMember(id, body.profileId, body.role); }
  @Post(':id/invitations') async inviteMember(@Param('id') id: string, @Body() body: { email: string; role?: 'OWNER' | 'ADMIN' | 'EDITOR' | 'MEMBER' }, @Req() request: any) { await this.organizations.assertCanManageMembers(id, request.user.accountId, request.user.role); return this.organizations.inviteMember(id, body.email, body.role); }
  @Patch('members/:memberId') updateMember(@Param('memberId') id: string, @Body() body: any, @Req() request: any) { return this.organizations.updateMemberByActor(id, body.role, request.user); }
  @Delete('members/:memberId') removeMember(@Param('memberId') id: string, @Req() request: any) { return this.organizations.removeMemberByActor(id, request.user); }
  @UseGuards(AdminGuard) @Patch(':id/subscription') updateSubscription(@Param('id') id: string, @Body() body: any) { return this.organizations.updateSubscription(id, body); }
}
