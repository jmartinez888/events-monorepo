import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, Prisma, Profile, TwoFactorMethod, VerificationPurpose } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { DirectoryService } from '../directory/directory.service.js';
import { VerificationCodesService, CODE_TTL_MINUTES } from './verification-codes.service.js';
import { config } from '../../common/config.js';
import { decryptSecret, encryptSecret, hashCode, normalizeRecoveryCode, recoveryCode, safeEqualHex } from '../../common/security/crypto.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../../common/security/totp.js';

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
type AccountWithProfile = AuthUser & { profile: Profile | null };
type PendingStep = 'verify' | 'mfa';
export interface RequestMeta { ip?: string; userAgent?: string }

/** Hash fijo para comparar aunque la cuenta no exista: mismo tiempo de respuesta. */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);
const RECOVERY_CODE_COUNT = 8;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly codes: VerificationCodesService,
    private readonly directory: DirectoryService,
  ) {}

  // ---------------------------------------------------------------------------
  // Acceso
  // ---------------------------------------------------------------------------

  /**
   * Respuestas: OK (sesión emitida), VERIFY_EMAIL (se envió un código al correo)
   * o MFA_REQUIRED (falta el segundo factor). Las dos últimas traen un
   * pendingToken de 10 minutos que solo sirve para completar ese paso.
   */
  async login(email: string, password: string, meta: RequestMeta = {}) {
    const account = await this.prisma.authUser.findUnique({ where: { email: normalizeEmail(email) }, include: { profile: true } });
    const valid = await bcrypt.compare(password, account?.passwordHash ?? DUMMY_HASH);
    if (!account || !valid) {
      await this.audit(account?.id, 'login_failed', meta, { email: normalizeEmail(email) });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!account.isActive) throw new ForbiddenException({ message: 'Tu cuenta está deshabilitada. Contacta al administrador.', code: 'ACCOUNT_DISABLED' });
    return this.continueLogin(account, meta);
  }

  /** Registro público: la cuenta nace sin permisos y no puede usarse hasta verificar el correo. */
  async register(data: { email: string; password: string; firstName: string; lastName: string }, meta: RequestMeta = {}) {
    if (process.env.ALLOW_PUBLIC_SIGNUP === 'false') throw new ForbiddenException('El registro público está deshabilitado. Solicita una cuenta al administrador.');
    const email = normalizeEmail(data.email);
    assertPasswordPolicy(data.password, email);
    if (await this.prisma.authUser.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException('Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.');
    }
    const account = await this.prisma.authUser.create({
      data: { email, passwordHash: await bcrypt.hash(data.password, 10), role: 'USER' },
      include: { profile: true },
    });
    // Nombres temporales hasta verificar; el vínculo con el Directorio se hace al confirmar el correo.
    await this.prisma.securityEvent.create({ data: { accountId: account.id, action: 'registered', ip: meta.ip, details: { firstName: data.firstName.trim(), lastName: data.lastName.trim() } } });
    return this.continueLogin(account, meta);
  }

  async verifyEmail(pendingToken: string, code: string, meta: RequestMeta = {}) {
    const account = await this.pendingAccount(pendingToken, 'verify');
    if (account.emailVerifiedAt) return this.continueLogin(account, meta);
    await this.codes.consume(account.id, 'EMAIL_VERIFY', code);
    const names = await this.registrationNames(account.id);
    const verified = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.authUser.update({ where: { id: account.id }, data: { emailVerifiedAt: new Date() } });
      const link = await this.directory.linkAccount(tx, updated, names);
      await tx.securityEvent.create({ data: { accountId: account.id, action: 'email_verified', ip: meta.ip, details: { directory: link.status } } });
      return tx.authUser.findUniqueOrThrow({ where: { id: account.id }, include: { profile: true } });
    });
    return this.continueLogin(verified, meta);
  }

  /** Reenvía el código del paso pendiente: verificación de correo o 2FA por correo. */
  async resendCode(pendingToken: string) {
    const { account, step } = await this.pendingAccountWithStep(pendingToken);
    if (step === 'verify') {
      if (account.emailVerifiedAt) throw new BadRequestException('El correo ya está verificado');
      await this.sendCode(account, 'EMAIL_VERIFY');
    } else {
      if (account.twoFactorMethod !== 'EMAIL') throw new BadRequestException('Tu segundo factor es la app autenticadora');
      await this.sendCode(account, 'LOGIN_2FA');
    }
    return { sent: true, expiresInMinutes: CODE_TTL_MINUTES };
  }

  async completeTwoFactor(pendingToken: string, code: string, meta: RequestMeta = {}) {
    const account = await this.pendingAccount(pendingToken, 'mfa');
    const method = await this.checkSecondFactor(account, code);
    if (!method) {
      await this.audit(account.id, 'two_factor_failed', meta);
      throw new BadRequestException({ message: 'Código incorrecto', code: 'CODE_INVALID' });
    }
    await this.audit(account.id, method === 'RECOVERY' ? 'two_factor_recovery_used' : 'two_factor_passed', meta);
    return this.issueSession(account, meta);
  }

  async refreshSession(refreshToken: string) {
    let payload: { sub: string; type?: string; sv?: number };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: config.jwtRefreshSecret() });
    } catch {
      throw new UnauthorizedException('Tu sesión expiró. Inicia sesión nuevamente.');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Sesión inválida');
    const account = await this.prisma.authUser.findUnique({ where: { id: payload.sub } });
    if (!account || !account.isActive) throw new UnauthorizedException('La cuenta no está disponible');
    // Cambio de contraseña, rol o 2FA incrementa la versión y anula los refresh tokens anteriores.
    if ((payload.sv ?? 0) !== account.sessionVersion) throw new UnauthorizedException('Tu sesión fue cerrada. Inicia sesión nuevamente.');
    return this.tokens(account);
  }

  async me(accountId: string) {
    const account = await this.prisma.authUser.findUnique({ where: { id: accountId }, include: { profile: true, recoveryCodes: { where: { usedAt: null }, select: { id: true } } } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    return { ...this.serialize(account), recoveryCodesLeft: account.recoveryCodes.length };
  }

  async securityEvents(accountId: string) {
    return this.prisma.securityEvent.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, action: true, ip: true, createdAt: true } });
  }

  async changePassword(accountId: string, currentPassword: string, newPassword: string, meta: RequestMeta = {}) {
    const account = await this.requireAccount(accountId);
    if (!(await bcrypt.compare(currentPassword, account.passwordHash))) throw new BadRequestException('La contraseña actual no es correcta');
    assertPasswordPolicy(newPassword, account.email);
    const updated = await this.prisma.authUser.update({ where: { id: accountId }, data: { passwordHash: await bcrypt.hash(newPassword, 10), sessionVersion: { increment: 1 }, passwordResetTokenHash: null, passwordResetExpiresAt: null }, include: { profile: true } });
    await this.audit(accountId, 'password_changed', meta);
    void this.mail.sendPasswordChanged(updated.email, { recipientName: fullName(updated.profile), email: updated.email });
    return this.tokens(updated);
  }

  async logoutAll(accountId: string, meta: RequestMeta = {}) {
    await this.prisma.authUser.update({ where: { id: accountId }, data: { sessionVersion: { increment: 1 } } });
    await this.audit(accountId, 'sessions_revoked', meta);
    return { revoked: true };
  }

  // ---------------------------------------------------------------------------
  // Segundo factor (opcional para todas las cuentas, incluido SUPER_ADMIN)
  // ---------------------------------------------------------------------------

  async beginTotpSetup(accountId: string) {
    const account = await this.requireAccount(accountId);
    if (account.twoFactorEnabledAt) throw new ConflictException('Desactiva el segundo factor actual antes de configurar otro');
    const secret = generateTotpSecret();
    await this.prisma.authUser.update({ where: { id: accountId }, data: { totpSecretEnc: encryptSecret(secret), totpLastStep: null } });
    return { secret, otpauthUri: otpauthUri(secret, account.email, config.appName()) };
  }

  async enableTotp(accountId: string, code: string, meta: RequestMeta = {}) {
    const account = await this.requireAccount(accountId);
    if (account.twoFactorEnabledAt) throw new ConflictException('El segundo factor ya está activo');
    if (!account.totpSecretEnc) throw new BadRequestException('Primero inicia la configuración de la app autenticadora');
    const step = verifyTotp(decryptSecret(account.totpSecretEnc), code);
    if (step === null) throw new BadRequestException({ message: 'Código incorrecto. Revisa la hora de tu teléfono.', code: 'CODE_INVALID' });
    return this.activateTwoFactor(account, 'TOTP', meta, { totpLastStep: step });
  }

  async beginEmailTwoFactorSetup(accountId: string) {
    const account = await this.requireAccount(accountId);
    if (account.twoFactorEnabledAt) throw new ConflictException('Desactiva el segundo factor actual antes de configurar otro');
    await this.sendCode(account, 'ENABLE_2FA');
    return { sent: true, email: maskEmail(account.email), expiresInMinutes: CODE_TTL_MINUTES };
  }

  async enableEmailTwoFactor(accountId: string, code: string, meta: RequestMeta = {}) {
    const account = await this.requireAccount(accountId);
    if (account.twoFactorEnabledAt) throw new ConflictException('El segundo factor ya está activo');
    await this.codes.consume(account.id, 'ENABLE_2FA', code);
    return this.activateTwoFactor(account, 'EMAIL', meta, { totpSecretEnc: null, totpLastStep: null });
  }

  async disableTwoFactor(accountId: string, password: string, meta: RequestMeta = {}) {
    const account = await this.requireAccount(accountId);
    if (!account.twoFactorEnabledAt) throw new BadRequestException('El segundo factor no está activo');
    if (!(await bcrypt.compare(password, account.passwordHash))) throw new BadRequestException('Contraseña incorrecta');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { accountId } });
      return tx.authUser.update({ where: { id: accountId }, data: { twoFactorMethod: null, twoFactorEnabledAt: null, totpSecretEnc: null, totpLastStep: null, sessionVersion: { increment: 1 } }, include: { profile: true } });
    });
    await this.audit(accountId, 'two_factor_disabled', meta);
    void this.notifySecurityChange(updated, 'Se desactivó la verificación en dos pasos de tu cuenta.');
    return { ...(await this.tokens(updated)), account: this.serialize(updated) };
  }

  async regenerateRecoveryCodes(accountId: string, password: string, meta: RequestMeta = {}) {
    const account = await this.requireAccount(accountId);
    if (!account.twoFactorEnabledAt) throw new BadRequestException('El segundo factor no está activo');
    if (!(await bcrypt.compare(password, account.passwordHash))) throw new BadRequestException('Contraseña incorrecta');
    const recoveryCodes = await this.prisma.$transaction((tx) => this.replaceRecoveryCodes(tx, accountId));
    await this.audit(accountId, 'recovery_codes_regenerated', meta);
    return { recoveryCodes };
  }

  // ---------------------------------------------------------------------------
  // Recuperación de contraseña (enlace por correo, flujo existente)
  // ---------------------------------------------------------------------------

  async forgotPassword(email: string) {
    const account = await this.prisma.authUser.findUnique({ where: { email: normalizeEmail(email) }, include: { profile: true } });
    if (!account || !account.isActive) return { accepted: true };
    const token = randomBytes(32).toString('hex');
    await this.prisma.authUser.update({
      where: { id: account.id },
      data: { passwordResetTokenHash: createHash('sha256').update(token).digest('hex'), passwordResetExpiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    const url = `${config.panelUrl()}/reset-password?token=${token}`;
    await this.mail.sendResetPassword(account.email, { recipientName: fullName(account.profile), resetUrl: url, expiresInMinutes: 15 });
    return { accepted: true };
  }

  async resetPassword(token: string, password: string) {
    const hash = createHash('sha256').update(token).digest('hex');
    const account = await this.prisma.authUser.findFirst({ where: { passwordResetTokenHash: hash, passwordResetExpiresAt: { gt: new Date() } }, include: { profile: true } });
    if (!account) throw new UnauthorizedException('El enlace de recuperación no es válido o venció');
    assertPasswordPolicy(password, account.email);
    await this.prisma.authUser.update({
      where: { id: account.id },
      // Abrir el enlace enviado al buzón prueba que el correo es suyo.
      data: { passwordHash: await bcrypt.hash(password, 10), passwordResetTokenHash: null, passwordResetExpiresAt: null, sessionVersion: { increment: 1 }, emailVerifiedAt: account.emailVerifiedAt ?? new Date() },
    });
    await this.audit(account.id, 'password_reset');
    void this.mail.sendPasswordChanged(account.email, { recipientName: fullName(account.profile), email: account.email });
    return { accepted: true };
  }

  // ---------------------------------------------------------------------------
  // Administración de cuentas (SUPER_ADMIN)
  // ---------------------------------------------------------------------------

  async createAccount(data: { email: string; password?: string; firstName?: string; lastName?: string; role?: Role }) {
    const email = normalizeEmail(data.email);
    const password = data.password ?? randomBytes(12).toString('base64url');
    if (data.password) assertPasswordPolicy(data.password, email);
    const result = await this.prisma.$transaction(async (tx) => {
      let account;
      try {
        account = await tx.authUser.create({ data: { email, passwordHash: await bcrypt.hash(password, 10), role: data.role ?? 'USER' } });
      } catch (error: any) {
        if (error?.code === 'P2002') throw new ConflictException('Ya existe una cuenta registrada con este correo electrónico.');
        throw error;
      }
      // El administrador da fe del correo al crear la cuenta; se reutiliza la persona del Directorio si existe.
      const link = await this.directory.linkAccount(tx, account, { firstName: data.firstName, lastName: data.lastName });
      return { account, profile: link.profile, directory: link.status };
    });
    const delivery = await this.mail.sendWelcome(result.account.email, { recipientName: fullName(result.profile) ?? (`${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || undefined), email: result.account.email, temporaryPassword: password, loginUrl: `${config.panelUrl()}/login` });
    return { id: result.account.id, email: result.account.email, role: result.account.role, isActive: result.account.isActive, profile: result.profile, directory: result.directory, emailSent: delivery.sent };
  }

  listAccounts() {
    return this.prisma.authUser.findMany({
      include: { profile: true },
      orderBy: { createdAt: 'desc' },
    }).then((accounts) => accounts.map((account) => ({ ...this.serialize(account), profile: account.profile, plan: account.plan, createdAt: account.createdAt })));
  }

  async updateAccount(id: string, data: { email?: string; role?: Role; plan?: 'FREE' | 'PREMIUM' | 'ENTERPRISE'; isActive?: boolean; password?: string }) {
    const current = await this.requireAccount(id);
    const email = data.email ? normalizeEmail(data.email) : undefined;
    if (data.password) assertPasswordPolicy(data.password, email ?? current.email);
    const sensitive = (email && email !== current.email) || (data.role && data.role !== current.role) || data.isActive === false || !!data.password;
    const updated = await this.prisma.authUser.update({
      where: { id },
      data: {
        email,
        // Un correo cambiado por el administrador debe volver a verificarse.
        emailVerifiedAt: email && email !== current.email ? null : undefined,
        role: data.role,
        plan: data.plan,
        isActive: data.isActive,
        passwordHash: data.password ? await bcrypt.hash(data.password, 10) : undefined,
        sessionVersion: sensitive ? { increment: 1 } : undefined,
      },
      include: { profile: true },
    });
    return { ...this.serialize(updated), profile: updated.profile, plan: updated.plan };
  }

  async removeAccount(id: string) {
    await this.requireAccount(id);
    return this.prisma.authUser.delete({ where: { id } });
  }

  async resetPasswordByAdmin(id: string) {
    const account = await this.prisma.authUser.findUnique({ where: { id }, include: { profile: true } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    const password = randomBytes(12).toString('base64url');
    await this.prisma.authUser.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10), passwordResetTokenHash: null, passwordResetExpiresAt: null, sessionVersion: { increment: 1 } } });
    const delivery = await this.mail.sendWelcome(account.email, { recipientName: fullName(account.profile), email: account.email, temporaryPassword: password, loginUrl: `${config.panelUrl()}/login` });
    return { accepted: true, emailSent: delivery.sent };
  }

  /** Para quien perdió su teléfono y sus códigos de recuperación: el administrador retira el 2FA. */
  async resetTwoFactorByAdmin(id: string, actorId: string) {
    const account = await this.requireAccount(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { accountId: id } });
      return tx.authUser.update({ where: { id }, data: { twoFactorMethod: null, twoFactorEnabledAt: null, totpSecretEnc: null, totpLastStep: null, sessionVersion: { increment: 1 } }, include: { profile: true } });
    });
    await this.audit(id, 'two_factor_reset_by_admin', {}, { actorId });
    void this.notifySecurityChange(updated, 'Un administrador retiró la verificación en dos pasos de tu cuenta. Vuelve a activarla desde tu perfil.');
    return { reset: true, email: account.email };
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private async continueLogin(account: AccountWithProfile, meta: RequestMeta) {
    if (!account.emailVerifiedAt) {
      await this.sendCode(account, 'EMAIL_VERIFY', true);
      return { status: 'VERIFY_EMAIL' as const, pendingToken: await this.pendingToken(account, 'verify'), email: maskEmail(account.email) };
    }
    if (account.twoFactorEnabledAt && account.twoFactorMethod) {
      if (account.twoFactorMethod === 'EMAIL') await this.sendCode(account, 'LOGIN_2FA', true);
      return { status: 'MFA_REQUIRED' as const, method: account.twoFactorMethod, pendingToken: await this.pendingToken(account, 'mfa'), email: maskEmail(account.email) };
    }
    return this.issueSession(account, meta);
  }

  private async issueSession(account: AccountWithProfile, meta: RequestMeta) {
    await this.prisma.authUser.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
    await this.audit(account.id, 'login', meta);
    return { status: 'OK' as const, ...(await this.tokens(account)), user: { ...(account.profile ?? {}), ...this.serialize(account) } };
  }

  private async tokens(account: AuthUser) {
    const payload = { sub: account.id, email: account.email, role: account.role, sv: account.sessionVersion };
    return {
      accessToken: await this.jwt.signAsync(payload, { secret: config.jwtAccessSecret(), expiresIn: '15m' }),
      refreshToken: await this.jwt.signAsync({ ...payload, type: 'refresh' }, { secret: config.jwtRefreshSecret(), expiresIn: '7d' }),
    };
  }

  private pendingToken(account: AuthUser, step: PendingStep) {
    return this.jwt.signAsync({ sub: account.id, type: 'pending', step, sv: account.sessionVersion }, { secret: config.jwtAccessSecret(), expiresIn: '10m' });
  }

  private async pendingAccountWithStep(token: string) {
    let payload: { sub: string; type?: string; step?: PendingStep; sv?: number };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: config.jwtAccessSecret() });
    } catch {
      throw new UnauthorizedException({ message: 'El paso de acceso expiró. Vuelve a iniciar sesión.', code: 'PENDING_EXPIRED' });
    }
    if (payload.type !== 'pending' || !payload.step) throw new UnauthorizedException({ message: 'El paso de acceso expiró. Vuelve a iniciar sesión.', code: 'PENDING_EXPIRED' });
    const account = await this.prisma.authUser.findUnique({ where: { id: payload.sub }, include: { profile: true } });
    if (!account || !account.isActive || account.sessionVersion !== (payload.sv ?? 0)) throw new UnauthorizedException({ message: 'Cuenta no disponible. Vuelve a iniciar sesión.', code: 'PENDING_EXPIRED' });
    return { account, step: payload.step };
  }

  private async pendingAccount(token: string, expected: PendingStep) {
    const { account, step } = await this.pendingAccountWithStep(token);
    if (step !== expected) throw new UnauthorizedException({ message: 'El paso de acceso no corresponde. Vuelve a iniciar sesión.', code: 'PENDING_EXPIRED' });
    return account;
  }

  /** Valida TOTP, código por correo o código de recuperación (que se consume). */
  private async checkSecondFactor(account: AuthUser, input: string): Promise<TwoFactorMethod | 'RECOVERY' | null> {
    const clean = input.replace(/\s+/g, '');
    if (/^\d{6}$/.test(clean)) {
      if (account.twoFactorMethod === 'TOTP' && account.totpSecretEnc) {
        const step = verifyTotp(decryptSecret(account.totpSecretEnc), clean);
        if (step === null) return null;
        // Solo avanza si el paso es nuevo: un código interceptado no se reutiliza en su ventana.
        const { count } = await this.prisma.authUser.updateMany({ where: { id: account.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
        return count ? 'TOTP' : null;
      }
      if (account.twoFactorMethod === 'EMAIL') {
        await this.codes.consume(account.id, 'LOGIN_2FA', clean);
        return 'EMAIL';
      }
      return null;
    }
    const formatted = normalizeRecoveryCode(clean);
    if (!formatted) return null;
    const hash = hashCode(formatted);
    const candidates = await this.prisma.recoveryCode.findMany({ where: { accountId: account.id, usedAt: null } });
    const match = candidates.find((candidate) => safeEqualHex(candidate.codeHash, hash));
    if (!match) return null;
    const { count } = await this.prisma.recoveryCode.updateMany({ where: { id: match.id, usedAt: null }, data: { usedAt: new Date() } });
    return count ? 'RECOVERY' : null;
  }

  private async activateTwoFactor(account: AuthUser, method: TwoFactorMethod, meta: RequestMeta, extra: Prisma.AuthUserUpdateInput) {
    const { updated, recoveryCodes } = await this.prisma.$transaction(async (tx) => {
      const recoveryCodes = await this.replaceRecoveryCodes(tx, account.id);
      const updated = await tx.authUser.update({ where: { id: account.id }, data: { ...extra, twoFactorMethod: method, twoFactorEnabledAt: new Date(), sessionVersion: { increment: 1 } }, include: { profile: true } });
      return { updated, recoveryCodes };
    });
    await this.audit(account.id, 'two_factor_enabled', meta, { method });
    void this.notifySecurityChange(updated, method === 'TOTP' ? 'Activaste la verificación en dos pasos con app autenticadora.' : 'Activaste la verificación en dos pasos con código por correo.');
    // La versión de sesión cambió: se entregan tokens nuevos para no cerrar la sesión actual.
    return { recoveryCodes, ...(await this.tokens(updated)), account: this.serialize(updated) };
  }

  private async replaceRecoveryCodes(tx: Prisma.TransactionClient, accountId: string) {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => recoveryCode());
    await tx.recoveryCode.deleteMany({ where: { accountId } });
    await tx.recoveryCode.createMany({ data: codes.map((code) => ({ accountId, codeHash: hashCode(code) })) });
    return codes;
  }

  private async sendCode(account: AccountWithProfile | AuthUser, purpose: VerificationPurpose, reuseRecent = false) {
    const code = await this.codes.issue(account.id, purpose, { reuseRecent });
    if (!code) return;
    const profile = 'profile' in account ? account.profile : null;
    const subject = purpose === 'EMAIL_VERIFY' ? 'Verifica tu correo' : purpose === 'LOGIN_2FA' ? 'Código de acceso' : 'Activa la verificación en dos pasos';
    const message = purpose === 'EMAIL_VERIFY'
      ? 'Usa este código para confirmar tu correo y activar tu cuenta.'
      : purpose === 'LOGIN_2FA' ? 'Usa este código para completar tu inicio de sesión. Si no fuiste tú, cambia tu contraseña.' : 'Usa este código para activar la verificación en dos pasos por correo.';
    const delivery = await this.mail.sendNotification(account.email, {
      recipientName: fullName(profile),
      title: `${subject} · ${config.appName()}`,
      message,
      details: [{ label: 'Código', value: code }, { label: 'Vigencia', value: `${CODE_TTL_MINUTES} minutos` }],
    });
    if (!delivery.sent) this.logger.warn(`No se pudo enviar el código ${purpose} a ${maskEmail(account.email)}: ${delivery.reason ?? 'sin detalle'}`);
  }

  private async notifySecurityChange(account: AccountWithProfile, message: string) {
    await this.mail.sendNotification(account.email, { recipientName: fullName(account.profile), title: `Cambio de seguridad · ${config.appName()}`, message: `${message} Si no reconoces este cambio, cambia tu contraseña y contacta al administrador.` });
  }

  private async registrationNames(accountId: string) {
    const event = await this.prisma.securityEvent.findFirst({ where: { accountId, action: 'registered' }, orderBy: { createdAt: 'desc' } });
    const details = (event?.details ?? {}) as { firstName?: string; lastName?: string };
    return { firstName: details.firstName, lastName: details.lastName };
  }

  private async requireAccount(id: string) {
    const account = await this.prisma.authUser.findUnique({ where: { id }, include: { profile: true } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    return account;
  }

  private serialize(account: AuthUser) {
    return {
      id: account.id,
      email: account.email,
      role: account.role,
      isActive: account.isActive,
      emailVerified: !!account.emailVerifiedAt,
      twoFactorEnabled: !!account.twoFactorEnabledAt,
      twoFactorMethod: account.twoFactorEnabledAt ? account.twoFactorMethod : null,
      lastLoginAt: account.lastLoginAt,
    };
  }

  private async audit(accountId: string | undefined, action: string, meta: RequestMeta = {}, details?: Prisma.InputJsonValue) {
    await this.prisma.securityEvent.create({ data: { accountId: accountId ?? null, action, ip: meta.ip?.slice(0, 64), details: { ...(details && typeof details === 'object' ? details : {}), ...(meta.userAgent ? { userAgent: meta.userAgent.slice(0, 300) } : {}) } } }).catch((error) => this.logger.error('No se pudo registrar el evento de seguridad', error));
  }
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

function fullName(profile?: { firstName?: string | null; lastName?: string | null } | null) {
  return `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || undefined;
}

export function maskEmail(email: string) {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export function assertPasswordPolicy(password: string, email: string) {
  if (password.length < 8 || password.length > 200) throw new BadRequestException('La contraseña debe tener entre 8 y 200 caracteres');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new BadRequestException('La contraseña debe incluir letras y números');
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) throw new BadRequestException('La contraseña no puede ser igual al correo');
}
