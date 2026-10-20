-- Preserve existing profiles and participants. Do not merge historical people.
ALTER TABLE "profiles" ADD COLUMN "primary_email" TEXT;
UPDATE "profiles" p SET "primary_email" = lower(trim(u.email))
FROM "auth_users" u WHERE p.auth_user_id = u.id;
UPDATE "profiles" SET "primary_email" = lower(trim(additional_emails->>0))
WHERE primary_email IS NULL AND jsonb_typeof(additional_emails) = 'array'
AND jsonb_typeof(additional_emails->0) = 'string';
CREATE INDEX "profiles_primary_email_idx" ON "profiles"("primary_email");
CREATE INDEX "profiles_identity_document_type_identity_document_number_idx"
ON "profiles"("identity_document_type", "identity_document_number");

ALTER TABLE "participant_roles"
ADD COLUMN "display_name" TEXT,
ADD COLUMN "display_name_en" TEXT,
ADD COLUMN "badge_color" TEXT,
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "is_speaker" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "certificate_hours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "requires_attendance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "certificate_text" TEXT,
ADD COLUMN "external_template_id" TEXT;
UPDATE "participant_roles" SET "is_speaker" = true
WHERE lower(name) IN ('speaker', 'speaker_mg', 'ponente', 'ponente_mg', 'ponente_magistral');

CREATE TABLE "participant_role_assignments" (
  "participant_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "participant_role_assignments_pkey" PRIMARY KEY ("participant_id", "role_id"),
  CONSTRAINT "participant_role_assignments_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "participant_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "participant_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "participant_role_assignments" ("participant_id", "role_id")
SELECT "id", "role_id" FROM "event_participants" WHERE "role_id" IS NOT NULL;

CREATE TYPE "AttendanceMethod" AS ENUM ('MANUAL', 'QR', 'ZOOM');
CREATE TABLE "attendance_records" (
  "id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "session_id" UUID,
  "scope_key" TEXT NOT NULL DEFAULT 'EVENT',
  "method" "AttendanceMethod" NOT NULL DEFAULT 'MANUAL',
  "source" TEXT NOT NULL DEFAULT 'MANUAL_APPROVAL',
  "valid" BOOLEAN NOT NULL DEFAULT false,
  "minutes" INTEGER,
  "percentage" DOUBLE PRECISION,
  "approved_by" UUID,
  "approved_at" TIMESTAMP(3),
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_records_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "attendance_records_participant_id_scope_key_key" ON "attendance_records"("participant_id", "scope_key");
-- Legacy check-in has unknown actor/time. Preserve that distinction explicitly.
INSERT INTO "attendance_records" ("id", "participant_id", "valid", "source", "updated_at")
SELECT "id", "id", true, 'LEGACY_CHECK_IN', CURRENT_TIMESTAMP
FROM "event_participants" WHERE "checked_in" = true;

CREATE TABLE "attendance_audits" (
  "id" UUID NOT NULL,
  "record_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "previous_valid" BOOLEAN,
  "valid" BOOLEAN NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_audits_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "attendance_audits_record_id_created_at_idx" ON "attendance_audits"("record_id", "created_at");
