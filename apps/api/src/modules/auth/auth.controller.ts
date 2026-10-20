import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthService, RequestMeta } from './auth.service.js';
import { AdminGuard } from './admin.guard.js';
import { Public } from '../../common/public.decorator.js';
import { RateLimit } from '../../common/security/rate-limit.guard.js';

const FIFTEEN_MINUTES = 15 * 60_000;

class LoginDto { @IsEmail() email!: string; @IsString() @MinLength(1) @MaxLength(200) password!: string; }
class RegisterDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
  @IsString() @MinLength(1) @MaxLength(120) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(120) lastName!: string;
}
class PendingDto { @IsString() @MaxLength(2000) pendingToken!: string; }
class PendingCodeDto extends PendingDto { @IsString() @MinLength(6) @MaxLength(20) code!: string; }
class CodeDto { @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'El código tiene 6 dígitos' }) code!: string; }
class PasswordDto { @IsString() @MinLength(1) @MaxLength(200) password!: string; }
class ChangePasswordDto { @IsString() @MinLength(1) @MaxLength(200) currentPassword!: string; @IsString() @MinLength(8) @MaxLength(200) newPassword!: string; }
class ForgotDto { @IsEmail() email!: string; }
class ResetDto { @IsString() token!: string; @IsString() @MinLength(8) @MaxLength(200) password!: string; }
class RefreshDto { @IsString() refreshToken!: string; }
class AdminCreateDto { @IsEmail() email!: string; @IsOptional() @IsString() @MinLength(8) password?: string; @IsOptional() @IsString() firstName?: string; @IsOptional() @IsString() lastName?: string; @IsOptional() @IsIn(['SUPER_ADMIN', 'ADMIN', 'USER']) role?: 'SUPER_ADMIN' | 'ADMIN' | 'USER'; }
class UpdateAccountDto { @IsOptional() @IsEmail() email?: string; @IsOptional() @IsIn(['SUPER_ADMIN', 'ADMIN', 'USER']) role?: 'SUPER_ADMIN' | 'ADMIN' | 'USER'; @IsOptional() isActive?: boolean; @IsOptional() @IsString() @MinLength(8) password?: string; }

type AuthedRequest = { user: { accountId: string }; ip?: string; headers: Record<string, string | undefined> };
const meta = (request: { ip?: string; headers: Record<string, string | undefined> }): RequestMeta => ({ ip: request.ip, userAgent: request.headers['user-agent'] });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Acceso y registro
  @Public() @RateLimit('login', 20, FIFTEEN_MINUTES) @Post('login') login(@Body() dto: LoginDto, @Req() request: AuthedRequest) { return this.auth.login(dto.email, dto.password, meta(request)); }
  @Public() @RateLimit('register', 5, 60 * 60_000) @Post('register') register(@Body() dto: RegisterDto, @Req() request: AuthedRequest) { return this.auth.register(dto, meta(request)); }
  @Public() @RateLimit('codes', 20, FIFTEEN_MINUTES) @Post('verify-email') verifyEmail(@Body() dto: PendingCodeDto, @Req() request: AuthedRequest) { return this.auth.verifyEmail(dto.pendingToken, dto.code, meta(request)); }
  @Public() @RateLimit('resend', 6, FIFTEEN_MINUTES) @Post('resend-code') resendCode(@Body() dto: PendingDto) { return this.auth.resendCode(dto.pendingToken); }
  @Public() @RateLimit('codes', 20, FIFTEEN_MINUTES) @Post('login/2fa') completeTwoFactor(@Body() dto: PendingCodeDto, @Req() request: AuthedRequest) { return this.auth.completeTwoFactor(dto.pendingToken, dto.code, meta(request)); }
  @Public() @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.auth.refreshSession(dto.refreshToken); }
  @Public() @RateLimit('forgot', 5, FIFTEEN_MINUTES) @Post('forgot-password') forgot(@Body() dto: ForgotDto) { return this.auth.forgotPassword(dto.email); }
  @Public() @RateLimit('reset', 10, FIFTEEN_MINUTES) @Post('reset-password') reset(@Body() dto: ResetDto) { return this.auth.resetPassword(dto.token, dto.password); }

  // Cuenta propia
  @Get('me') me(@Req() request: AuthedRequest) { return this.auth.me(request.user.accountId); }
  @Get('security-events') securityEvents(@Req() request: AuthedRequest) { return this.auth.securityEvents(request.user.accountId); }
  @RateLimit('password', 10, FIFTEEN_MINUTES) @Post('change-password') changePassword(@Body() dto: ChangePasswordDto, @Req() request: AuthedRequest) { return this.auth.changePassword(request.user.accountId, dto.currentPassword, dto.newPassword, meta(request)); }
  @Post('logout-all') logoutAll(@Req() request: AuthedRequest) { return this.auth.logoutAll(request.user.accountId, meta(request)); }

  // Segundo factor opcional: app autenticadora (TOTP) o código por correo
  @Post('2fa/totp/setup') beginTotp(@Req() request: AuthedRequest) { return this.auth.beginTotpSetup(request.user.accountId); }
  @RateLimit('codes', 20, FIFTEEN_MINUTES) @Post('2fa/totp/enable') enableTotp(@Body() dto: CodeDto, @Req() request: AuthedRequest) { return this.auth.enableTotp(request.user.accountId, dto.code, meta(request)); }
  @RateLimit('resend', 6, FIFTEEN_MINUTES) @Post('2fa/email/setup') beginEmail(@Req() request: AuthedRequest) { return this.auth.beginEmailTwoFactorSetup(request.user.accountId); }
  @RateLimit('codes', 20, FIFTEEN_MINUTES) @Post('2fa/email/enable') enableEmail(@Body() dto: CodeDto, @Req() request: AuthedRequest) { return this.auth.enableEmailTwoFactor(request.user.accountId, dto.code, meta(request)); }
  @RateLimit('password', 10, FIFTEEN_MINUTES) @Post('2fa/disable') disable(@Body() dto: PasswordDto, @Req() request: AuthedRequest) { return this.auth.disableTwoFactor(request.user.accountId, dto.password, meta(request)); }
  @RateLimit('password', 10, FIFTEEN_MINUTES) @Post('2fa/recovery-codes') recoveryCodes(@Body() dto: PasswordDto, @Req() request: AuthedRequest) { return this.auth.regenerateRecoveryCodes(request.user.accountId, dto.password, meta(request)); }

  // Administración global
  @UseGuards(AdminGuard) @Post('admin-create') adminCreate(@Body() dto: AdminCreateDto) { return this.auth.createAccount(dto); }
  @UseGuards(AdminGuard) @Get('users') users() { return this.auth.listAccounts(); }
  @UseGuards(AdminGuard) @Patch('users/:id') updateUser(@Param('id') id: string, @Body() dto: UpdateAccountDto) { return this.auth.updateAccount(id, dto); }
  @UseGuards(AdminGuard) @Post('users/:id/reset-password') resetUserPassword(@Param('id') id: string) { return this.auth.resetPasswordByAdmin(id); }
  @UseGuards(AdminGuard) @Post('users/:id/reset-2fa') resetUserTwoFactor(@Param('id') id: string, @Req() request: AuthedRequest) { return this.auth.resetTwoFactorByAdmin(id, request.user.accountId); }
  @UseGuards(AdminGuard) @Delete('users/:id') removeUser(@Param('id') id: string) { return this.auth.removeAccount(id); }
}
