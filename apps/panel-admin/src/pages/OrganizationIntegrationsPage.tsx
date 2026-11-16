import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Mail } from "lucide-react"
import { api } from "@/api/client"
import { useAuthStore } from "@/store/auth.store"
import { PageHeader } from "@/components/page-header"
import { SettingsPanel, type CustomEntry, type SettingsAdapter } from "@/pages/admin/PlatformSettingsPanel"
import { OrgMailSettingsForm } from "@/pages/OrgMailSettingsForm"

interface MailSummary { deliveryReady: boolean; configured: boolean }

/** Configuración › Integraciones: cada institución conecta sus propias cuentas. */
export function OrganizationIntegrationsPage() {
  const navigate = useNavigate()
  const organizationId = useAuthStore((state) => state.selectedOrganization?.id) || ""
  const organizationName = useAuthStore((state) => state.selectedOrganization?.name) || "la institución"
  const userEmail = useAuthStore((state) => state.user?.email) || ""
  const [mail, setMail] = useState<MailSummary | null>(null)
  const [mailVersion, setMailVersion] = useState(0)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    api.emailSettings.get(organizationId).then((data) => { if (!cancelled) setMail(data) }).catch(() => { if (!cancelled) setMail(null) })
    return () => { cancelled = true }
  }, [organizationId, mailVersion])

  const adapter = useMemo<SettingsAdapter>(() => ({
    list: () => api.organizationIntegrations.list(organizationId),
    save: (key, data) => api.organizationIntegrations.save(organizationId, key, data),
    test: (key) => api.organizationIntegrations.test(organizationId, key),
    registerTelegramWebhook: () => api.organizationIntegrations.registerTelegramWebhook(organizationId),
  }), [organizationId])

  const mailEntry: CustomEntry = {
    key: "mail",
    title: "Correo",
    icon: Mail,
    status: !mail ? { label: "Cargando", tone: "bg-muted-foreground/30" } : mail.deliveryReady ? { label: "Activo", tone: "bg-emerald-500" } : { label: mail.configured ? "Incompleto" : "Sin configurar", tone: "bg-amber-500" },
    content: <OrgMailSettingsForm organizationId={organizationId} organizationName={organizationName} defaultRecipient={userEmail} onSaved={() => setMailVersion((value) => value + 1)} />,
  }

  return (
    <div className="container mx-auto w-full px-6">
      <div className="mb-8">
        <PageHeader
          title="Integraciones"
          showBackButton
          onBackClick={() => navigate("/dashboard/settings/business")}
          description={`Cuentas propias de ${organizationName}: correo, Zoom, Facebook Live, Asistencia, Certificados y Telegram. No se comparten con otras instituciones.`}
        />
      </div>
      {organizationId ? <SettingsPanel key={organizationId} adapter={adapter} keys={["zoom", "facebook", "attendance", "certificates", "telegram"]} custom={[mailEntry]} /> : null}
    </div>
  )
}
