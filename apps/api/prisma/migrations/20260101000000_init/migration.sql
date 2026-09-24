-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'FINISHED');

-- CreateEnum
CREATE TYPE "EventMode" AS ENUM ('PHYSICAL', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "AccountPlan" AS ENUM ('FREE', 'PREMIUM', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('ISSUED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RegistrationFormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RegistrationSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MarketingConsentStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED', 'PENDING_CONFIRMATION');

-- CreateEnum
CREATE TYPE "EmailTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TemplateChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationTiming" AS ENUM ('IMMEDIATE', 'BEFORE_EVENT', 'AFTER_EVENT', 'AFTER_PREVIOUS_STEP');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MediaOwnerType" AS ENUM ('ORGANIZATION', 'EVENT', 'EDITION', 'PROFILE');

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('COVER', 'LOGO', 'GALLERY', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaOrientation" AS ENUM ('LANDSCAPE', 'PORTRAIT', 'SQUARE', 'VIDEO', 'OTHER');

-- CreateTable
CREATE TABLE "auth_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "GlobalRole" NOT NULL DEFAULT 'USER',
    "plan" "AccountPlan" NOT NULL DEFAULT 'FREE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified_at" TIMESTAMP(3),
    "password_reset_token_hash" TEXT,
    "password_reset_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID,
    "organization_id" UUID,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "avatar_url" TEXT,
    "bio" TEXT,
    "identity_document_type" TEXT,
    "identity_document_number" TEXT,
    "birth_date" TIMESTAMP(3),
    "sex" TEXT,
    "location" TEXT,
    "institution" TEXT,
    "dedication" TEXT,
    "research_interests" TEXT,
    "areas_of_interest" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expertise_areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "social_links" JSONB,
    "additional_emails" JSONB,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "organization_type" TEXT,
    "logo_url" TEXT,
    "cover_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "profile_id" UUID,
    "email_fallback" TEXT,
    "consent_status" "MarketingConsentStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "consented_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_segments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'MANUAL',
    "rules" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_segment_members" (
    "segment_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_segment_members_pkey" PRIMARY KEY ("segment_id","contact_id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "account_id" UUID,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan" "AccountPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renews_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "provider" TEXT,
    "provider_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_branches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "department" TEXT,
    "province" TEXT,
    "district" TEXT,
    "address" TEXT,
    "reference" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "contact_phones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contact_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "main_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "event_name" TEXT NOT NULL,
    "description" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "event_mode" "EventMode",
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "cover_url" TEXT,
    "logo_url" TEXT,
    "contact_email" TEXT,
    "whatsapp_community_url" TEXT,
    "venue_address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "main_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_setup_progress" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "basic_info_completed" BOOLEAN NOT NULL DEFAULT false,
    "roles_completed" BOOLEAN NOT NULL DEFAULT false,
    "edition_completed" BOOLEAN NOT NULL DEFAULT false,
    "people_completed" BOOLEAN NOT NULL DEFAULT false,
    "contact_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_setup_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_contacts" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_details" (
    "id" SERIAL NOT NULL,
    "event_id" UUID NOT NULL,
    "content" TEXT,
    "social_links" JSONB,
    "media" JSONB,
    "sponsors" JSONB,
    "faqs" JSONB,

    CONSTRAINT "event_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editions" (
    "id" UUID NOT NULL,
    "main_event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "modality" TEXT,
    "location" TEXT,
    "description" TEXT,
    "cover_url" TEXT,
    "meta_thumbnail_url" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "orientation" "MediaOrientation" NOT NULL DEFAULT 'OTHER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_links" (
    "id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "owner_type" "MediaOwnerType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "purpose" "MediaPurpose" NOT NULL DEFAULT 'GALLERY',
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_forms" (
    "id" UUID NOT NULL,
    "main_event_id" UUID NOT NULL,
    "edition_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "status" "RegistrationFormStatus" NOT NULL DEFAULT 'DRAFT',
    "opens_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),
    "max_submissions" INTEGER,
    "approval_mode" TEXT NOT NULL DEFAULT 'MANUAL',
    "purpose" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "allow_edition_selection" BOOLEAN NOT NULL DEFAULT false,
    "default_edition_id" UUID,
    "thank_you_message" TEXT,
    "thank_you_redirect_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_form_fields" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "validation" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "registration_form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_submissions" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "edition_id" UUID,
    "status" "RegistrationSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "email" TEXT,
    "answers" JSONB NOT NULL,
    "profile_id" UUID,
    "participant_id" UUID,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "registration_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_activities" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),

    CONSTRAINT "event_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_sessions" (
    "id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "event_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_thematic_lines" (
    "session_id" UUID NOT NULL,
    "thematic_line_id" UUID NOT NULL,

    CONSTRAINT "session_thematic_lines_pkey" PRIMARY KEY ("session_id","thematic_line_id")
);

-- CreateTable
CREATE TABLE "session_resources" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_speakers" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,

    CONSTRAINT "session_speakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "role_id" UUID,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_roles" (
    "id" UUID NOT NULL,
    "main_event_id" UUID,
    "edition_id" UUID,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thematic_lines" (
    "id" UUID NOT NULL,
    "main_event_id" UUID NOT NULL,
    "edition_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "thematic_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tickets" (
    "id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "capacity" INTEGER,

    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "design" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_certificates" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "template_id" UUID,
    "code" TEXT NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_tracking_logs" (
    "id" UUID NOT NULL,
    "certificate_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_tracking_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),

    CONSTRAINT "education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company" TEXT NOT NULL,
    "position" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),

    CONSTRAINT "employment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issued_at" TIMESTAMP(3),

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "TemplateChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "EmailTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT,
    "sender_name" TEXT,
    "sender_email" TEXT,
    "preview_text" TEXT,
    "content" JSONB,
    "html_content" TEXT,
    "category" TEXT DEFAULT 'CUSTOM',
    "thumbnail_url" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "use_org_credentials" BOOLEAN NOT NULL DEFAULT true,
    "custom_credentials" JSONB,
    "source_template_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_email_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "default_provider" TEXT NOT NULL DEFAULT 'RESEND',
    "resend_api_key_encrypted" TEXT,
    "resend_domain" TEXT,
    "resend_from_email" TEXT,
    "resend_from_name" TEXT,
    "smtp_host" TEXT,
    "smtp_port" INTEGER DEFAULT 587,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT false,
    "smtp_user" TEXT,
    "smtp_pass_encrypted" TEXT,
    "smtp_from_email" TEXT,
    "smtp_from_name" TEXT,
    "verified_senders" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_email_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_automations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_id" UUID,
    "registration_form_id" UUID,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'REGISTRATION_SUBMITTED',
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_portals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "hero_title" TEXT,
    "hero_description" TEXT,
    "hero_image_url" TEXT,
    "featured_event_id" UUID,
    "sections" JSONB,
    "navigation" JSONB,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_portals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "segment_ids" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB,
    "scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_event_enrollments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "automation_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "submission_id" UUID,
    "first_name" TEXT,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendance_status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "purchase_status" TEXT NOT NULL DEFAULT 'NONE',
    "benefit_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_event_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_automation_steps" (
    "id" UUID NOT NULL,
    "automation_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "timing" "AutomationTiming" NOT NULL,
    "offset_hours" INTEGER NOT NULL DEFAULT 0,
    "template_id" UUID,
    "subject" TEXT,
    "html_content" TEXT,
    "conditions" JSONB,

    CONSTRAINT "marketing_automation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "automation_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "contact_id" UUID,
    "recipient_email" TEXT NOT NULL,
    "recipient_name" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "provider_message_id" TEXT,
    "error" TEXT,
    "context" JSONB,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_auth_user_id_key" ON "profiles"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "marketing_contacts_organization_id_email_fallback_idx" ON "marketing_contacts"("organization_id", "email_fallback");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_contacts_organization_id_profile_id_key" ON "marketing_contacts"("organization_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_contacts_organization_id_email_fallback_key" ON "marketing_contacts"("organization_id", "email_fallback");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_segments_organization_id_name_key" ON "marketing_segments"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_profile_id_key" ON "organization_members"("organization_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_account_id_key" ON "organization_members"("organization_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_organization_id_key" ON "organization_subscriptions"("organization_id");

-- CreateIndex
CREATE INDEX "main_events_organization_id_status_idx" ON "main_events"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_setup_progress_event_id_key" ON "event_setup_progress"("event_id");

-- CreateIndex
CREATE INDEX "event_contacts_event_id_idx" ON "event_contacts"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_details_event_id_key" ON "event_details"("event_id");

-- CreateIndex
CREATE INDEX "editions_main_event_id_idx" ON "editions"("main_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_key_key" ON "media_assets"("key");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_url_key" ON "media_assets"("url");

-- CreateIndex
CREATE INDEX "media_assets_organization_id_created_at_idx" ON "media_assets"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "media_links_owner_type_owner_id_purpose_position_idx" ON "media_links"("owner_type", "owner_id", "purpose", "position");

-- CreateIndex
CREATE UNIQUE INDEX "media_links_media_id_owner_type_owner_id_purpose_key" ON "media_links"("media_id", "owner_type", "owner_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "registration_forms_slug_key" ON "registration_forms"("slug");

-- CreateIndex
CREATE INDEX "registration_forms_main_event_id_idx" ON "registration_forms"("main_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "registration_form_fields_form_id_key_key" ON "registration_form_fields"("form_id", "key");

-- CreateIndex
CREATE INDEX "registration_submissions_form_id_status_idx" ON "registration_submissions"("form_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "registration_submissions_form_id_email_key" ON "registration_submissions"("form_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "session_speakers_session_id_profile_id_key" ON "session_speakers"("session_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_edition_id_profile_id_key" ON "event_participants"("edition_id", "profile_id");

-- CreateIndex
CREATE INDEX "participant_roles_main_event_id_edition_id_idx" ON "participant_roles"("main_event_id", "edition_id");

-- CreateIndex
CREATE UNIQUE INDEX "participant_roles_main_event_id_edition_id_name_key" ON "participant_roles"("main_event_id", "edition_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "participant_certificates_code_key" ON "participant_certificates"("code");

-- CreateIndex
CREATE INDEX "email_templates_organization_id_channel_status_idx" ON "email_templates"("organization_id", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_email_settings_organization_id_key" ON "organization_email_settings"("organization_id");

-- CreateIndex
CREATE INDEX "marketing_automations_organization_id_status_idx" ON "marketing_automations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "marketing_automations_registration_form_id_status_idx" ON "marketing_automations"("registration_form_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_automations_registration_form_id_trigger_key" ON "marketing_automations"("registration_form_id", "trigger");

-- CreateIndex
CREATE UNIQUE INDEX "organization_portals_organization_id_key" ON "organization_portals"("organization_id");

-- CreateIndex
CREATE INDEX "marketing_campaigns_organization_id_status_idx" ON "marketing_campaigns"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_event_enrollments_submission_id_key" ON "marketing_event_enrollments"("submission_id");

-- CreateIndex
CREATE INDEX "marketing_event_enrollments_event_id_attendance_status_purc_idx" ON "marketing_event_enrollments"("event_id", "attendance_status", "purchase_status");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_event_enrollments_automation_id_contact_id_key" ON "marketing_event_enrollments"("automation_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_automation_steps_automation_id_position_key" ON "marketing_automation_steps"("automation_id", "position");

-- CreateIndex
CREATE INDEX "email_deliveries_status_scheduled_at_idx" ON "email_deliveries"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_deliveries_step_id_recipient_email_key" ON "email_deliveries"("step_id", "recipient_email");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_contacts" ADD CONSTRAINT "marketing_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_contacts" ADD CONSTRAINT "marketing_contacts_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_segments" ADD CONSTRAINT "marketing_segments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_segment_members" ADD CONSTRAINT "marketing_segment_members_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "marketing_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_segment_members" ADD CONSTRAINT "marketing_segment_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "marketing_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_branches" ADD CONSTRAINT "organization_branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "main_events" ADD CONSTRAINT "main_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_setup_progress" ADD CONSTRAINT "event_setup_progress_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "main_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_contacts" ADD CONSTRAINT "event_contacts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "main_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_details" ADD CONSTRAINT "event_details_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "main_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editions" ADD CONSTRAINT "editions_main_event_id_fkey" FOREIGN KEY ("main_event_id") REFERENCES "main_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_links" ADD CONSTRAINT "media_links_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_forms" ADD CONSTRAINT "registration_forms_main_event_id_fkey" FOREIGN KEY ("main_event_id") REFERENCES "main_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_forms" ADD CONSTRAINT "registration_forms_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_form_fields" ADD CONSTRAINT "registration_form_fields_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "registration_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_submissions" ADD CONSTRAINT "registration_submissions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "registration_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_activities" ADD CONSTRAINT "event_activities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "event_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_thematic_lines" ADD CONSTRAINT "session_thematic_lines_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_thematic_lines" ADD CONSTRAINT "session_thematic_lines_thematic_line_id_fkey" FOREIGN KEY ("thematic_line_id") REFERENCES "thematic_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_resources" ADD CONSTRAINT "session_resources_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "participant_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thematic_lines" ADD CONSTRAINT "thematic_lines_main_event_id_fkey" FOREIGN KEY ("main_event_id") REFERENCES "main_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_certificates" ADD CONSTRAINT "participant_certificates_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_certificates" ADD CONSTRAINT "participant_certificates_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "certificate_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_tracking_logs" ADD CONSTRAINT "certificate_tracking_logs_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "participant_certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education" ADD CONSTRAINT "education_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_email_settings" ADD CONSTRAINT "organization_email_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_automations" ADD CONSTRAINT "marketing_automations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_automations" ADD CONSTRAINT "marketing_automations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "main_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_automations" ADD CONSTRAINT "marketing_automations_registration_form_id_fkey" FOREIGN KEY ("registration_form_id") REFERENCES "registration_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_portals" ADD CONSTRAINT "organization_portals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_event_enrollments" ADD CONSTRAINT "marketing_event_enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_event_enrollments" ADD CONSTRAINT "marketing_event_enrollments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "main_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_event_enrollments" ADD CONSTRAINT "marketing_event_enrollments_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "marketing_automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_event_enrollments" ADD CONSTRAINT "marketing_event_enrollments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "marketing_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_event_enrollments" ADD CONSTRAINT "marketing_event_enrollments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "registration_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_automation_steps" ADD CONSTRAINT "marketing_automation_steps_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "marketing_automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_automation_steps" ADD CONSTRAINT "marketing_automation_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
