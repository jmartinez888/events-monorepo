-- CreateEnum
CREATE TYPE "TwoFactorMethod" AS ENUM ('TOTP', 'EMAIL');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('EMAIL_VERIFY', 'LOGIN_2FA', 'ENABLE_2FA');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PREREGISTERED', 'CONFIRMED', 'WAITLISTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationOrigin" AS ENUM ('FORM', 'MANUAL', 'SPEAKER', 'OPEN_REGISTRATION', 'ONSITE', 'IMPORT');

-- CreateEnum
CREATE TYPE "VirtualAttendanceMode" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('DISABLED', 'PENDING', 'SYNCED', 'ERROR');

-- CreateEnum
CREATE TYPE "SessionSpeakerRole" AS ENUM ('SPEAKER', 'CO_SPEAKER', 'MODERATOR');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "FileScope" AS ENUM ('MATERIAL', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PUBLIC', 'REGISTERED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'DELETED');

-- Adaptación IIAP, fase 2: verificación de correo y 2FA opcional, inscripción con
-- token/estado/origen, integraciones (Zoom, Facebook Live, Asistencia,
-- Certificados), notificaciones y archivos del evento.
--
-- Requiere PostgreSQL 12+ (varios ADD VALUE sobre un enum en la misma migración).

-- AlterEnum
ALTER TYPE "CertificateStatus" ADD VALUE 'PENDING';
ALTER TYPE "CertificateStatus" ADD VALUE 'FAILED';
ALTER TYPE "CertificateStatus" ADD VALUE 'SUPERSEDED';

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "external_ref" TEXT;

-- AlterTable
ALTER TABLE "auth_users" ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totp_last_step" INTEGER,
ADD COLUMN     "totp_secret_enc" TEXT,
ADD COLUMN     "two_factor_enabled_at" TIMESTAMP(3),
ADD COLUMN     "two_factor_method" "TwoFactorMethod";

-- AlterTable
-- Las filas existentes reciben su token y luego se retira el valor por defecto
-- de la base: Prisma genera los siguientes.
ALTER TABLE "event_participants" ADD COLUMN     "access_token" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "origin" "RegistrationOrigin" NOT NULL DEFAULT 'FORM',
ADD COLUMN     "status" "RegistrationStatus" NOT NULL DEFAULT 'CONFIRMED';

ALTER TABLE "event_participants" ALTER COLUMN "access_token" DROP DEFAULT;
UPDATE "event_participants" SET "confirmed_at" = "registered_at" WHERE "status" = 'CONFIRMED' AND "confirmed_at" IS NULL;

-- AlterTable
ALTER TABLE "event_sessions" ADD COLUMN     "ends_at" TIMESTAMP(3),
ADD COLUMN     "modality" "EventMode",
ADD COLUMN     "starts_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "main_events" ADD COLUMN     "attendance_mirror_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attendance_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "facebook_live_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminder_offsets" INTEGER[] DEFAULT ARRAY[60]::INTEGER[],
ADD COLUMN     "virtual_attendance_mode" "VirtualAttendanceMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "waitlist_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "zoom_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "participant_certificates" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "hours" INTEGER,
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "issued_by" UUID,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ADD COLUMN     "revoked_reason" TEXT,
ADD COLUMN     "role_id" UUID,
ADD COLUMN     "verify_url" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "participant_role_assignments" ADD COLUMN     "direct_approval_reason" TEXT,
ADD COLUMN     "direct_approved_at" TIMESTAMP(3),
ADD COLUMN     "direct_approved_by" UUID;

-- AlterTable
ALTER TABLE "session_speakers" ADD COLUMN     "role" "SessionSpeakerRole" NOT NULL DEFAULT 'SPEAKER',
ADD COLUMN     "topic" TEXT;

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "account_id" UUID,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_integrations" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "zoom_meeting_id" TEXT,
    "zoom_join_url" TEXT,
    "zoom_start_url_enc" TEXT,
    "zoom_registration_url" TEXT,
    "zoom_status" "SyncStatus" NOT NULL DEFAULT 'DISABLED',
    "zoom_error" TEXT,
    "zoom_ended_at" TIMESTAMP(3),
    "facebook_live_id" TEXT,
    "facebook_live_url" TEXT,
    "rtmp_stream_url" TEXT,
    "rtmp_stream_key_enc" TEXT,
    "facebook_status" "SyncStatus" NOT NULL DEFAULT 'DISABLED',
    "facebook_error" TEXT,
    "attendance_event_id" TEXT,
    "attendance_status" "SyncStatus" NOT NULL DEFAULT 'DISABLED',
    "attendance_error" TEXT,
    "attendance_synced_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_registrations" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "registrant_id" TEXT,
    "join_url" TEXT,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_intervals" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL,
    "left_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'zoom_report',

    CONSTRAINT "attendance_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_jobs" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupe_key" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 6,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_receipts" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "webhook_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "telegram_chat_id" TEXT,
    "telegram_linked_at" TIMESTAMP(3),
    "telegram_link_token" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "participant_id" UUID,
    "main_event_id" UUID NOT NULL,
    "session_id" UUID,
    "type" TEXT NOT NULL,
    "channel" "NotificationChannel",
    "status" "NotificationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_files" (
    "id" UUID NOT NULL,
    "main_event_id" UUID NOT NULL,
    "scope" "FileScope" NOT NULL,
    "session_id" UUID,
    "session_speaker_id" UUID,
    "document_type" TEXT,
    "title" TEXT NOT NULL,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_file_versions" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_codes_account_id_purpose_created_at_idx" ON "verification_codes"("account_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "recovery_codes_account_id_idx" ON "recovery_codes"("account_id");

-- CreateIndex
CREATE INDEX "security_events_account_id_created_at_idx" ON "security_events"("account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_integrations_session_id_key" ON "session_integrations"("session_id");

-- CreateIndex
CREATE INDEX "session_integrations_zoom_meeting_id_idx" ON "session_integrations"("zoom_meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_registrations_participant_id_session_id_key" ON "session_registrations"("participant_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_intervals_record_id_joined_at_left_at_key" ON "attendance_intervals"("record_id", "joined_at", "left_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_jobs_dedupe_key_key" ON "integration_jobs"("dedupe_key");

-- CreateIndex
CREATE INDEX "integration_jobs_status_run_at_idx" ON "integration_jobs"("status", "run_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_receipts_provider_external_id_key" ON "webhook_receipts"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_profile_id_key" ON "notification_preferences"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_telegram_link_token_key" ON "notification_preferences"("telegram_link_token");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_for_idx" ON "notifications"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "notifications_participant_id_idx" ON "notifications"("participant_id");

-- CreateIndex
CREATE INDEX "event_files_main_event_id_scope_status_idx" ON "event_files"("main_event_id", "scope", "status");

-- CreateIndex
CREATE INDEX "event_files_session_id_idx" ON "event_files"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_file_versions_file_id_version_key" ON "event_file_versions"("file_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_access_token_key" ON "event_participants"("access_token");

-- CreateIndex
CREATE INDEX "event_participants_edition_id_status_idx" ON "event_participants"("edition_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "participant_certificates_idempotency_key_key" ON "participant_certificates"("idempotency_key");

-- CreateIndex
CREATE INDEX "participant_certificates_participant_id_role_id_status_idx" ON "participant_certificates"("participant_id", "role_id", "status");

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_certificates" ADD CONSTRAINT "participant_certificates_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "participant_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_integrations" ADD CONSTRAINT "session_integrations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_intervals" ADD CONSTRAINT "attendance_intervals_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_main_event_id_fkey" FOREIGN KEY ("main_event_id") REFERENCES "main_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_files" ADD CONSTRAINT "event_files_main_event_id_fkey" FOREIGN KEY ("main_event_id") REFERENCES "main_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_files" ADD CONSTRAINT "event_files_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_files" ADD CONSTRAINT "event_files_session_speaker_id_fkey" FOREIGN KEY ("session_speaker_id") REFERENCES "session_speakers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_file_versions" ADD CONSTRAINT "event_file_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "event_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Las cuentas creadas antes de la verificación por código ya estaban en uso:
-- se consideran verificadas para no bloquear su acceso.
UPDATE "auth_users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;

-- Los certificados anteriores certificaban el rol principal de la inscripción.
UPDATE "participant_certificates" pc
SET "role_id" = ep."role_id"
FROM "event_participants" ep
WHERE pc."participant_id" = ep."id" AND pc."role_id" IS NULL;

-- Revisión de posibles duplicados del Directorio
-- CreateTable
CREATE TABLE "directory_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "reason" TEXT NOT NULL,
    "provisional_profile_id" UUID NOT NULL,
    "candidate_profile_ids" UUID[],
    "submitted" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "directory_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "directory_reviews_status_created_at_idx" ON "directory_reviews"("status", "created_at");

-- CreateIndex
CREATE INDEX "directory_reviews_organization_id_status_idx" ON "directory_reviews"("organization_id", "status");


-- Cola de marketing: reclamación atómica y reintentos
-- AlterTable
ALTER TABLE "email_deliveries" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_at" TIMESTAMP(3);

