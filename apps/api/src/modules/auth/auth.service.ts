import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { MailService } from '../mail/mail.service.js';
import { publicAccountSelect } from './public-account.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.authUser.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { profile: true },
    });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' }),
      refreshToken: await this.jwt.signAsync({ ...payload, type: 'refresh' }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' }),
      user: {
        ...(user.profile ?? {}),
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }
  async refreshSession(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'USER'; type?: string }>(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
      if (payload.type !== 'refresh') throw new UnauthorizedException('Sesión inválida');
      const user = await this.prisma.authUser.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException('La cuenta no está disponible');
      const accessPayload = { sub: user.id, email: user.email, role: user.role };
      return { accessToken: await this.jwt.signAsync(accessPayload, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' }), refreshToken: await this.jwt.signAsync({ ...accessPayload, type: 'refresh' }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' }) };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Tu sesión expiró. Inicia sesión nuevamente.');
    }
  }

  async createAccount(data: {
    email: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  }) {
    const password = data.password ?? randomBytes(12).toString('base64url');
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    let user;
    try {
      user = await this.prisma.authUser.create({
        data: {
          id,
          email: data.email.toLowerCase().trim(),
          passwordHash,
          role: data.role ?? 'USER',
          profile: { create: { firstName: data.firstName, lastName: data.lastName } },
        },
        select: { ...publicAccountSelect, profile: true },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Ya existe una cuenta registrada con este correo electrónico.');
      throw error;
    }

    const fullName = `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || undefined;
    const delivery = await this.mail.sendWelcome(user.email, {
      recipientName: fullName,
      email: user.email,
      temporaryPassword: password,
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      profile: user.profile,
      emailSent: delivery.sent,
    };
  }

  listAccounts() {
    return this.prisma.authUser.findMany({
      select: { ...publicAccountSelect, profile: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateAccount(
    id: string,
    data: {
      email?: string;
      role?: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
      plan?: 'FREE' | 'PREMIUM' | 'ENTERPRISE';
      isActive?: boolean;
      password?: string;
    }
  ) {
    const exists = await this.prisma.authUser.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Cuenta no encontrada');
    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;
    return this.prisma.authUser.update({
      where: { id },
      data: {
        email: data.email?.toLowerCase().trim(),
        role: data.role,
        plan: data.plan,
        isActive: data.isActive,
        passwordHash,
      },
      select: { ...publicAccountSelect, profile: true },
    });
  }

  async removeAccount(id: string) {
    const exists = await this.prisma.authUser.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Cuenta no encontrada');
    return this.prisma.authUser.delete({ where: { id }, select: publicAccountSelect });
  }

  async resetPasswordByAdmin(id: string) {
    const user = await this.prisma.authUser.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException('Cuenta no encontrada');
    const password = randomBytes(12).toString('base64url');
    await this.prisma.authUser.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });

    const fullName = `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() || undefined;
    const delivery = await this.mail.sendWelcome(user.email, {
      recipientName: fullName,
      email: user.email,
      temporaryPassword: password,
    });

    return { accepted: true, emailSent: delivery.sent };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.authUser.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { profile: true },
    });
    if (!user) return { accepted: true };

    const token = randomBytes(32).toString('hex');
    await this.prisma.authUser.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: createHash('sha256').update(token).digest('hex'),
        passwordResetExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const baseUrl = process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5173';
    const url = `${baseUrl.replace(/\/+$/, '')}/reset-password?token=${token}`;
    const fullName = `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() || undefined;

    await this.mail.sendResetPassword(user.email, {
      recipientName: fullName,
      resetUrl: url,
      expiresInMinutes: 15,
    });

    return { accepted: true };
  }

  async resetPassword(token: string, password: string) {
    const hash = createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.authUser.findFirst({
      where: {
        passwordResetTokenHash: hash,
        passwordResetExpiresAt: { gt: new Date() },
      },
      include: { profile: true },
    });
    if (!user) throw new UnauthorizedException('El enlace de recuperación no es válido o venció');

    await this.prisma.authUser.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });

    // Notify user of successful password update
    const fullName = `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() || undefined;
    void this.mail.sendPasswordChanged(user.email, {
      recipientName: fullName,
      email: user.email,
    });

    return { accepted: true };
  }
}
