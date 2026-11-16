-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "values" JSONB NOT NULL DEFAULT '{}',
    "secrets" JSONB NOT NULL DEFAULT '{}',
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
