import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Mail } from "lucide-react"
import { api } from "@/api/client"
import { useAuthStore } from "@/store/auth.store"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SettingsPanel, type CustomEntry, type SettingsAdapter } from "@/pages/admin/PlatformSettingsPanel"
import { OrgEmailSettingsModal } from "@/pages/templates/OrgEmailSettingsModal"

interface MailSummary { deliveryReady: boolean; configured: boolean; defaultProvider: string; defaultSender: string | null; replyTo?: string; resendFromName?: string; smtpFromName?: string }

/** Configuración › Integraciones: cada institución conecta sus propias cuentas. */
export function OrganizationIntegrationsPage() {
  const navigate = useNavigate()
  const organizationId = useAuthStore((state) => state.selectedOrganization?.id) || ""
  const organizationName = useAuthStore((state) => state.selectedOrganization?.name) || "la institución"
  const [mailOpen, setMailOpen] = useState(false)
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
    content: (
      <Card className="p-6">
        <h3 className="text-lg font-semibold">Correo de {organizationName}</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Cuenta con la que salen las confirmaciones, recordatorios, certificados y campañas de los eventos de esta institución.</p>
        {mail?.deliveryReady ? (
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Proveedor</dt><dd className="mt-0.5 font-medium">{mail.defaultProvider === "RESEND" ? "Resend" : "SMTP"}</dd></div>
            <div><dt className="text-muted-foreground">Alias de envío</dt><dd className="mt-0.5 truncate font-medium">{mail.defaultSender}</dd></div>
            <div><dt className="text-muted-foreground">Responder a</dt><dd className="mt-0.5 truncate font-medium">{mail.replyTo || "Al mismo alias"}</dd></div>
          </dl>
        ) : (
          <p className="mt-5 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">Mientras no se configure, los avisos de esta institución no se envían por correo.</p>
        )}
        <Button type="button" className="mt-6" onClick={() => setMailOpen(true)}>{mail?.configured ? "Editar correo" : "Configurar correo"}</Button>
      </Card>
    ),
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
      <OrgEmailSettingsModal open={mailOpen} onOpenChange={setMailOpen} onSaved={() => setMailVersion((value) => value + 1)} />
    </div>
  )
}
