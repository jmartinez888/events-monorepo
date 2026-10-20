import 'reflect-metadata';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../dist/database/prisma.service.js';
import { EventAccessService } from '../dist/common/event-access.service.js';
import { DirectoryService } from '../dist/modules/directory/directory.service.js';
import { DirectoryReviewsService } from '../dist/modules/directory/directory-reviews.service.js';
import { AttendanceService } from '../dist/modules/attendance/attendance.service.js';
import { ParticipantsService } from '../dist/modules/participants/participants.service.js';
import { RolesService } from '../dist/modules/event-content/roles.service.js';
import { RegistrationFormsService } from '../dist/modules/registration-forms/registration-forms.service.js';
import { CertificatesService } from '../dist/modules/certificates/certificates.service.js';
import { NotificationsService } from '../dist/modules/notifications/notifications.service.js';
import { RegistrationsService } from '../dist/modules/registrations/registrations.service.js';
import { IntegrationJobsService } from '../dist/modules/integrations/integration-jobs.service.js';
import { SessionSyncService } from '../dist/modules/integrations/session-sync.service.js';
import { EventFilesService } from '../dist/modules/event-files/event-files.service.js';
import { FileUrlSigner } from '../dist/modules/storage/file-url.signer.js';
import { LocalDiskStorage } from '../dist/modules/storage/local-disk.storage.js';
import { VerificationCodesService } from '../dist/modules/auth/verification-codes.service.js';
import { AuthService } from '../dist/modules/auth/auth.service.js';

/** Nunca ejecutar las pruebas contra una base de usuarios. */
export function assertIsolatedDatabase() {
  const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/events_test') throw new Error('Use only the isolated events_test database on localhost:55432');
}

/** Correo falso: guarda los envíos para leer los códigos de verificación. */
export function fakeMail() {
  const sent = [];
  const record = async (to, data) => { sent.push({ to, ...data }); return { sent: true }; };
  return {
    sent,
    lastCode(to) {
      const message = [...sent].reverse().find((item) => item.to === to && item.details?.some((detail) => detail.label === 'Código'));
      return message?.details.find((detail) => detail.label === 'Código').value;
    },
    send: async (options) => record(options.to, { title: options.subject }),
    sendNotification: record,
    sendWelcome: record,
    sendResetPassword: record,
    sendPasswordChanged: record,
  };
}

export function buildServices(overrides = {}) {
  assertIsolatedDatabase();
  process.env.INTEGRATION_WORKER = 'false';
  process.env.NOTIFICATIONS_WORKER = 'false';
  const prisma = new PrismaService();
  const mail = overrides.mail ?? fakeMail();
  const telegram = overrides.telegram ?? { configured: false, deepLink: () => null, sendMessage: async () => undefined, verifyWebhook: () => false };
  const zoom = overrides.zoom ?? { configured: false };
  const external = overrides.certificatesClient ?? { configured: false };
  const directory = new DirectoryService();
  const access = new EventAccessService(prisma);
  const attendance = new AttendanceService(prisma, access);
  const jobs = new IntegrationJobsService(prisma);
  const notifications = new NotificationsService(prisma, mail, telegram);
  const storageDir = mkdtempSync(path.join(tmpdir(), 'events-files-'));
  const storage = new LocalDiskStorage(storageDir);
  const signer = new FileUrlSigner();
  const files = new EventFilesService(prisma, access, signer, storage);
  const registrations = new RegistrationsService(prisma, access, directory, notifications, jobs, files, telegram);
  const participants = new ParticipantsService(prisma, directory, access, attendance, registrations);
  const roles = new RolesService(prisma, access);
  const certificates = new CertificatesService(prisma, access, attendance, notifications, jobs, external);
  certificates.onModuleInit();
  const forms = new RegistrationFormsService(prisma, { enrollRegistration: async () => ({ enrolled: 0 }) }, mail, registrations, notifications);
  const sync = new SessionSyncService(prisma, jobs, zoom, { configured: false }, { configured: false }, attendance, registrations, notifications);
  sync.onModuleInit();
  const reviews = new DirectoryReviewsService(prisma, access);
  const codes = new VerificationCodesService(prisma);
  const auth = new AuthService(prisma, new JwtService({}), mail, codes, directory);
  return { prisma, mail, directory, access, attendance, jobs, notifications, files, storage, signer, registrations, participants, roles, certificates, forms, sync, reviews, codes, auth };
}
