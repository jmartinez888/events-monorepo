import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service.js';
import { AdminGuard } from './admin.guard.js';
import { Public } from '../../common/public.decorator.js';

class LoginDto { @IsEmail() email!: string; @IsString() @MinLength(8) password!: string; }
class ForgotDto { @IsEmail() email!: string; }
class ResetDto { @IsString() token!: string; @IsString() @MinLength(8) password!: string; }
class RefreshDto { @IsString() refreshToken!: string; }
class AdminCreateDto { @IsEmail() email!: string; @IsOptional() @IsString() @MinLength(8) password?: string; @IsOptional() @IsString() firstName?: string; @IsOptional() @IsString() lastName?: string; @IsOptional() @IsIn(['SUPER_ADMIN', 'ADMIN', 'USER']) role?: 'SUPER_ADMIN' | 'ADMIN' | 'USER'; }
class UpdateAccountDto { @IsOptional() @IsEmail() email?: string; @IsOptional() @IsIn(['SUPER_ADMIN', 'ADMIN', 'USER']) role?: 'SUPER_ADMIN' | 'ADMIN' | 'USER'; @IsOptional() @IsBoolean() isActive?: boolean; @IsOptional() @IsString() @MinLength(8) password?: string; }

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto.email, dto.password); }
  @Public() @Post('forgot-password') forgot(@Body() dto: ForgotDto) { return this.auth.forgotPassword(dto.email); }
  @Public() @Post('reset-password') reset(@Body() dto: ResetDto) { return this.auth.resetPassword(dto.token, dto.password); }
  @Public() @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.auth.refreshSession(dto.refreshToken); }
  @UseGuards(AdminGuard) @Post('admin-create') adminCreate(@Body() dto: AdminCreateDto) { return this.auth.createAccount(dto); }
  @UseGuards(AdminGuard) @Get('users') users() { return this.auth.listAccounts(); }
  @UseGuards(AdminGuard) @Patch('users/:id') updateUser(@Param('id') id: string, @Body() dto: UpdateAccountDto) { return this.auth.updateAccount(id, dto); }
  @UseGuards(AdminGuard) @Post('users/:id/reset-password') resetUserPassword(@Param('id') id: string) { return this.auth.resetPasswordByAdmin(id); }
  @UseGuards(AdminGuard) @Delete('users/:id') removeUser(@Param('id') id: string) { return this.auth.removeAccount(id); }
}
