-- Las integraciones pasan a configurarse por institución.
CREATE TABLE "organization_integration_settings" (
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "values" JSONB NOT NULL DEFAULT '{}',
    "secrets" JSONB NOT NULL DEFAULT '{}',
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_integration_settings_pkey" PRIMARY KEY ("organization_id","key")
);

ALTER TABLE "organization_integration_settings" ADD CONSTRAINT "organization_integration_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- En la configuración global solo queda el correo del sistema.
DELETE FROM "platform_settings" WHERE "key" <> 'mail';

-- Correo por institución: dirección de respuesta.
ALTER TABLE "organization_email_settings" ADD COLUMN "reply_to" TEXT;
