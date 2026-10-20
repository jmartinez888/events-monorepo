import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AdminGuard } from './admin.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { EmailService } from './email.service.js';
import { VerificationCodesService } from './verification-codes.service.js';
import { DirectoryModule } from '../directory/directory.module.js';
import { RateLimitGuard } from '../../common/security/rate-limit.guard.js';

@Module({
  imports: [JwtModule.register({}), DirectoryModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    VerificationCodesService,
    EmailService,
    AdminGuard,
    // El JWT se valida primero; el límite de intentos aplica después a cada ruta marcada.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [AuthService, EmailService, AdminGuard, JwtModule],
})
export class AuthModule {}
