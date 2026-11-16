import React, { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { api } from "@/api/client"
import { useAuthStore } from "@/store/auth.store"
import {
  Mail,
  ShieldCheck,
  Send,
  Lock,
  Eye,
  EyeOff,
  Server,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Trash2,
  RotateCw,
  RefreshCw,
} from "lucide-react"

interface OrgEmailSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function OrgEmailSettingsModal({
  open,
  onOpenChange,
  onSaved,
}: OrgEmailSettingsModalProps) {
  const { selectedOrganization, user } = useAuthStore()
  const orgId = selectedOrganization?.id

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // Form states
  const [provider, setProvider] = useState<"RESEND" | "GMAIL_SMTP" | "CUSTOM_SMTP">("RESEND")

  // Resend
  const [resendApiKey, setResendApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [resendWebhookSecret, setResendWebhookSecret] = useState("")
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)
  const [resendDomain, setResendDomain] = useState("")
  const [resendFromEmail, setResendFromEmail] = useState("")
  const [resendFromName, setResendFromName] = useState("")

  // SMTP / Gmail
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpSecure, setSmtpSecure] = useState(false)
  const [smtpUser, setSmtpUser] = useState("")
  const [smtpPass, setSmtpPass] = useState("")
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [smtpFromEmail, setSmtpFromEmail] = useState("")
  const [replyTo, setReplyTo] = useState("")
  const [smtpFromName, setSmtpFromName] = useState("")

  // Additional Senders
  const [verifiedSenders, setVerifiedSenders] = useState<Array<{ email: string; name?: string; label?: string }>>([])
  const [newSenderEmail, setNewSenderEmail] = useState("")
  const [newSenderLabel, setNewSenderLabel] = useState("")

  // Test states
  const [testEmail, setTestEmail] = useState(user?.email || "")
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [credentialNeedsRotation, setCredentialNeedsRotation] = useState(false)
  const [webhooks, setWebhooks] = useState<any[]>([])
  const [managedWebhookId, setManagedWebhookId] = useState<string | null>(null)
  const [webhookEvents, setWebhookEvents] = useState<any[]>([])
  const [webhooksLoading, setWebhooksLoading] = useState(false)
  const [webhookAction, setWebhookAction] = useState<string | null>(null)

  useEffect(() => {
    if (open && orgId) {
      loadSettings()
    }
  }, [open, orgId])

  const loadSettings = async () => {
    if (!orgId) return
    try {
      setLoading(true)
      const data = await api.emailSettings.get(orgId)

      setProvider(data.defaultProvider || "RESEND")
      setCredentialNeedsRotation(Boolean(data.credentialNeedsRotation))
      setResendApiKey(data.resendApiKeyMasked || "")
      setResendWebhookSecret(data.resendWebhookSecretMasked || "")
      setResendDomain(data.resendDomain || "")
      setResendFromEmail(data.resendFromEmail || "")
      setResendFromName(data.resendFromName || selectedOrganization?.name || "Eventos")

      setSmtpHost(data.smtpHost || "")
      setSmtpPort(data.smtpPort || 587)
      setSmtpSecure(!!data.smtpSecure)
      setSmtpUser(data.smtpUser || "")
      setSmtpPass(data.smtpPassMasked || "")
      setSmtpFromEmail(data.smtpFromEmail || "")
      setSmtpFromName(data.smtpFromName || selectedOrganization?.name || "Eventos")
      setReplyTo(data.replyTo || "")

      if (data.verifiedSenders && Array.isArray(data.verifiedSenders)) {
        setVerifiedSenders(data.verifiedSenders)
      } else if (data.resendFromEmail) {
        setVerifiedSenders([
          { email: data.resendFromEmail, name: data.resendFromName, label: "Principal" }
        ])
      }
      setTestResult(null)
      if ((data.defaultProvider || "RESEND") === "RESEND") loadWebhooks()
    } catch (err: any) {
      toast.error(err?.message || "Error al cargar la configuración de correo.")
    } finally {
      setLoading(false)
    }
  }

  const loadWebhooks = async () => {
    if (!orgId) return
    try {
      setWebhooksLoading(true)
      const result = await api.emailSettings.webhooks(orgId)
      const items = Array.isArray(result?.data) ? result.data : []
      const currentId = result?.managedWebhookId || null
      setWebhooks(items)
      setManagedWebhookId(currentId)
      const activeId = currentId || items[0]?.id
      if (activeId) {
        const events = await api.emailSettings.webhookEvents(orgId, activeId)
        setWebhookEvents(Array.isArray(events?.data) ? events.data : [])
      } else setWebhookEvents([])
    } catch (err: any) {
      setWebhooks([])
      setWebhookEvents([])
      // No bloquea la edición de credenciales cuando aún no hay una API key válida.
    } finally {
      setWebhooksLoading(false)
    }
  }

  const handleCreateWebhook = async () => {
    if (!orgId) return
    try {
      setWebhookAction("create")
      await api.emailSettings.createWebhook(orgId)
      toast.success("Webhook creado. Su secreto quedó guardado cifrado para esta institución.")
      await loadWebhooks()
    } catch (err: any) { toast.error(err?.message || "No se pudo crear el webhook en Resend.") }
    finally { setWebhookAction(null) }
  }

  const handleRotateWebhook = async (id: string) => {
    if (!orgId) return
    try {
      setWebhookAction(`rotate:${id}`)
      await api.emailSettings.rotateWebhookSecret(orgId, id)
      toast.success("Secreto rotado y actualizado de forma segura.")
    } catch (err: any) { toast.error(err?.message || "No se pudo rotar el secreto.") }
    finally { setWebhookAction(null) }
  }

  const handleDeleteWebhook = async (id: string) => {
    if (!orgId || !window.confirm("¿Eliminar este webhook de Resend? Se dejarán de recibir sus eventos.")) return
    try {
      setWebhookAction(`delete:${id}`)
      await api.emailSettings.removeWebhook(orgId, id)
      toast.success("Webhook eliminado.")
      await loadWebhooks()
    } catch (err: any) { toast.error(err?.message || "No se pudo eliminar el webhook.") }
    finally { setWebhookAction(null) }
  }

  const handleAddSender = () => {
    if (!newSenderEmail || !newSenderEmail.includes("@")) {
      return toast.error("Ingresa un correo de remitente válido.")
    }
    if (verifiedSenders.some((s) => s.email.toLowerCase() === newSenderEmail.trim().toLowerCase())) {
      return toast.error("Este remitente ya está en la lista.")
    }

    setVerifiedSenders([
      ...verifiedSenders,
      {
        email: newSenderEmail.trim(),
        name: resendFromName || selectedOrganization?.name,
        label: newSenderLabel.trim() || "Remitente adicional",
      },
    ])
    setNewSenderEmail("")
    setNewSenderLabel("")
  }

  const handleRemoveSender = (index: number) => {
    setVerifiedSenders(verifiedSenders.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!orgId) return
    try {
      setSaving(true)

      const payload: any = {
        defaultProvider: provider,
        resendApiKey: resendApiKey.trim() || undefined,
        resendWebhookSecret: resendWebhookSecret.trim() || undefined,
        resendDomain: resendDomain.trim() || undefined,
        resendFromEmail: resendFromEmail.trim() || undefined,
        resendFromName: resendFromName.trim() || undefined,
        smtpHost: smtpHost.trim() || undefined,
        smtpPort: Number(smtpPort) || 587,
        smtpSecure,
        smtpUser: smtpUser.trim() || undefined,
        smtpPass: smtpPass.trim() || undefined,
        smtpFromEmail: smtpFromEmail.trim() || undefined,
        smtpFromName: smtpFromName.trim() || undefined,
        replyTo: replyTo.trim(),
        verifiedSenders,
        isActive: true,
      }

      await api.emailSettings.save(orgId, payload)
      toast.success("Configuración de correo guardada con seguridad.")
      onSaved?.()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err?.message || "Error al guardar la configuración.")
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    if (!orgId) return
    if (!testEmail || !testEmail.includes("@")) {
      return toast.error("Ingresa un correo de prueba válido.")
    }

    try {
      setTesting(true)
      setTestResult(null)

      const payload: any = {
        recipientEmail: testEmail.trim(),
        provider,
        resendApiKey: resendApiKey.trim() || undefined,
        resendFromEmail: resendFromEmail.trim() || undefined,
        resendFromName: resendFromName.trim() || undefined,
        smtpHost: smtpHost.trim() || undefined,
        smtpPort: Number(smtpPort) || 587,
        smtpSecure,
        smtpUser: smtpUser.trim() || undefined,
        smtpPass: smtpPass.trim() || undefined,
        smtpFromEmail: smtpFromEmail.trim() || undefined,
        smtpFromName: smtpFromName.trim() || undefined,
      }

      const res = await api.emailSettings.test(orgId, payload)
      setTestResult({
        success: true,
        message: res.message || "Correo de prueba enviado exitosamente.",
      })
      toast.success("¡Prueba exitosa! El correo fue despachado correctamente.")
    } catch (err: any) {
      const errMsg = err?.message || "No se pudo enviar el correo de prueba."
      setTestResult({
        success: false,
        message: errMsg,
      })
      toast.error(errMsg)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0 rounded-3xl border-border bg-card">
        {/* Header */}
        <div className="p-6 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div>
              <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                Configuración de Correo para Marketing
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Configura el proveedor que usará esta organización para sus campañas y comunicaciones de marketing. Las notificaciones internas del sistema usan la configuración global de la plataforma.
              </DialogDescription>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-3">
            <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Cargando credenciales seguras...</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {credentialNeedsRotation && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-amber-800 dark:text-amber-300">
                Las credenciales restauradas pertenecen a una clave de cifrado anterior. Ingresa y guarda nuevamente la API key de Resend o la contraseña SMTP antes de enviar correos.
              </div>
            )}
            {/* Provider Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground">Proveedor de Envíos</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Resend Option */}
                <div
                  onClick={() => setProvider("RESEND")}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all flex flex-col justify-between ${provider === "RESEND"
                    ? "border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/20 shadow-sm"
                    : "border-border bg-background hover:bg-muted/40"
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center text-xs font-bold font-mono">
                        R
                      </div>
                      <span className="font-bold text-sm text-foreground">Resend (API)</span>
                    </div>
                    <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-md">
                      Disponible
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Usa una cuenta de Resend y el remitente verificado de tu organización.
                  </p>
                </div>

                {/* Gmail / SMTP Option */}
                <div
                  onClick={() => setProvider("GMAIL_SMTP")}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all flex flex-col justify-between ${provider === "GMAIL_SMTP"
                    ? "border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/20 shadow-sm"
                    : "border-border bg-background hover:bg-muted/40"
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-lg bg-rose-500 text-white flex items-center justify-center text-xs font-bold">
                        <Mail className="size-4" />
                      </div>
                      <span className="font-bold text-sm text-foreground">Gmail / SMTP</span>
                    </div>
                    <span className="text-[10px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md">
                      Contraseña de App
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Envía directamente a través de una cuenta de Google Workspace / Gmail o servidor SMTP corporativo.
                  </p>
                </div>
              </div>
            </div>

            {/* Provider Forms */}
            {provider === "RESEND" ? (
              <div className="rounded-2xl border border-border bg-background p-5 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Lock className="size-4 text-emerald-600" />
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Credenciales de Resend
                    </h4>
                  </div>
                  <a
                    href="https://resend.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Obtener API Key en Resend</span>
                    <ExternalLink className="size-3" />
                  </a>
                </div>

                {/* API Key */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>API Key de Resend (re_...)</span>
                    <span className="text-[10px] text-muted-foreground">Se guarda cifrada en servidor</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={resendApiKey}
                      onChange={(e) => setResendApiKey(e.target.value)}
                      placeholder=""
                      className="h-10 pr-10 rounded-xl font-mono text-xs bg-muted/20 border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Domain & Senders */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Secreto del webhook de Resend (whsec_...)</span>
                    <span className="text-[10px] text-muted-foreground">Opcional hasta activar seguimiento</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showWebhookSecret ? "text" : "password"}
                      value={resendWebhookSecret}
                      onChange={(e) => setResendWebhookSecret(e.target.value)}
                      placeholder="whsec_..."
                      className="h-10 pr-10 rounded-xl font-mono text-xs bg-muted/20 border-border"
                    />
                    <button type="button" onClick={() => setShowWebhookSecret(!showWebhookSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showWebhookSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    Si lo creas desde este panel, el secreto se guarda automáticamente cifrado. También puedes pegar aquí uno ya existente.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Webhook de seguimiento</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">Recibe entregas, rebotes, quejas y fallos de esta cuenta de Resend. Aperturas y clics se miden directamente por la plataforma.</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={loadWebhooks} disabled={webhooksLoading} className="h-8 rounded-lg px-2 text-[11px]">
                      <RefreshCw className={`mr-1 size-3 ${webhooksLoading ? "animate-spin" : ""}`} />Actualizar
                    </Button>
                  </div>
                  {webhooks.length === 0 && !webhooksLoading ? (
                    <Button type="button" size="sm" onClick={handleCreateWebhook} disabled={webhookAction === "create"} className="h-8 rounded-lg text-[11px]">
                      {webhookAction === "create" ? "Creando…" : "Crear webhook en Resend"}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      {webhooks.map((webhook) => (
                        <div key={webhook.id} className="rounded-lg border border-border bg-background px-3 py-2 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-muted-foreground">{webhook.id}</span>
                            <span className={webhook.status === "enabled" ? "text-emerald-600" : "text-muted-foreground"}>{webhook.status || "enabled"}{webhook.id === managedWebhookId ? " · gestionado" : ""}</span>
                          </div>
                          <p className="mt-1 truncate text-muted-foreground">{webhook.endpoint}</p>
                          <div className="mt-2 flex gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleRotateWebhook(webhook.id)} disabled={webhookAction === `rotate:${webhook.id}`} className="h-7 px-1.5 text-[10px]">
                              <RotateCw className="mr-1 size-3" />Rotar secreto
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteWebhook(webhook.id)} disabled={webhookAction === `delete:${webhook.id}`} className="h-7 px-1.5 text-[10px] text-destructive">
                              <Trash2 className="mr-1 size-3" />Eliminar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {webhookEvents.length > 0 && <p className="text-[10px] text-muted-foreground">Últimos eventos: {webhookEvents.slice(0, 3).map((event) => `${event.type} (${event.status})`).join(" · ")}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Dominio Verificado</label>
                    <Input
                      value={resendDomain}
                      onChange={(e) => setResendDomain(e.target.value)}
                      placeholder=""
                      className="h-10 rounded-xl text-xs bg-muted/20 border-border"
                    />
                    <p className="text-[10px] text-muted-foreground">Ingresa el dominio verificado de tu organización.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Nombre Remitente Predeterminado</label>
                    <Input
                      value={resendFromName}
                      onChange={(e) => setResendFromName(e.target.value)}
                      placeholder=""
                      className="h-10 rounded-xl text-xs bg-muted/20 border-border"
                    />
                  </div>
                </div>

                {/* Default From Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Alias de envío (De:)
                  </label>
                  <Input
                    value={resendFromEmail}
                    onChange={(e) => setResendFromEmail(e.target.value)}
                    placeholder=""
                    className="h-10 rounded-xl text-xs bg-muted/20 border-border"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Debe pertenecer al dominio verificado de tu organización.
                  </p>
                </div>

                {/* Additional / Frequent Senders Catalog */}
                <div className="pt-3 border-t border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-foreground">Remitentes Autorizados de la Institución</h5>
                      <p className="text-[11px] text-muted-foreground">
                        Estos correos aparecerán como opciones rápidas al crear cualquier plantilla.
                      </p>
                    </div>
                  </div>

                  {/* List of senders */}
                  <div className="space-y-2">
                    {verifiedSenders.map((sender, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-card/60 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                          <div>
                            <span className="font-semibold text-foreground">{sender.email}</span>
                            {sender.label && (
                              <span className="ml-2 text-[10px] bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                                {sender.label}
                              </span>
                            )}
                          </div>
                        </div>
                        {verifiedSenders.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSender(idx)}
                            className="p-1 text-muted-foreground hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Sender Inline */}
                  <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                    <Input
                      value={newSenderEmail}
                      onChange={(e) => setNewSenderEmail(e.target.value)}
                      placeholder=""
                      className="h-9 rounded-xl text-xs flex-1"
                    />
                    <Input
                      value={newSenderLabel}
                      onChange={(e) => setNewSenderLabel(e.target.value)}
                      placeholder=""
                      className="h-9 rounded-xl text-xs sm:w-40"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddSender}
                      className="h-9 rounded-xl px-3 text-xs flex items-center gap-1.5 shrink-0"
                    >
                      <Plus className="size-3.5" />
                      <span>Añadir</span>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-background p-5 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Server className="size-4 text-rose-500" />
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Configuración Gmail / SMTP
                    </h4>
                  </div>
                </div>

                {/* Info Note for Gmail App Passwords */}
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="size-3.5" />
                    Instrucciones para Gmail / Google Workspace:
                  </p>
                  <p>
                    Para Gmail, debes activar la verificación en 2 pasos en tu cuenta de Google y generar una{" "}
                    <strong>Contraseña de Aplicación</strong> (de 16 caracteres) en{" "}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-semibold"
                    >
                      myaccount.google.com/apppasswords
                    </a>
                    . No uses tu contraseña personal.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Correo de Gmail / Usuario SMTP</label>
                    <Input
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder=""
                      className="h-10 rounded-xl text-xs bg-muted/20 border-border"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Contraseña de Aplicación (16 letras)</label>
                    <div className="relative">
                      <Input
                        type={showSmtpPass ? "text" : "password"}
                        value={smtpPass}
                        onChange={(e) => setSmtpPass(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="h-10 pr-10 rounded-xl font-mono text-xs bg-muted/20 border-border"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSmtpPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-foreground">Servidor SMTP</label>
                    <Input
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder=""
                      className="h-10 rounded-xl text-xs bg-muted/20 border-border"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Puerto</label>
                    <Input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(Number(e.target.value))}
                      placeholder="587"
                      className="h-10 rounded-xl text-xs bg-muted/20 border-border"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Nombre Remitente</label>
                    <Input
                      value={smtpFromName}
                      onChange={(e) => setSmtpFromName(e.target.value)}
                      placeholder=""
                      className="h-10 rounded-xl text-xs bg-muted/20 border-border"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Alias de envío (De:)</label>
                    <Input
                      value={smtpFromEmail}
                      onChange={(e) => setSmtpFromEmail(e.target.value)}
                      placeholder={smtpUser || "eventos@institucion.gob.pe"}
                      className="h-10 rounded-xl text-xs bg-muted/20 border-border"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Puede ser distinto de la cuenta SMTP si esa cuenta tiene permiso para enviar como este alias (en Gmail: «Enviar como»).
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="org-mail-reply-to" className="text-xs font-semibold text-foreground">Responder a</label>
              <Input
                id="org-mail-reply-to"
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="informes@institucion.gob.pe"
                className="h-10 rounded-xl text-xs bg-muted/20 border-border"
              />
              <p className="text-[10px] text-muted-foreground">Opcional. Las respuestas de los destinatarios llegan a esta dirección en lugar del alias.</p>
            </div>

            {/* Test Connection Box */}
            <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Send className="size-4 text-primary" />
                  <h5 className="text-xs font-bold text-foreground">Probar Conexión y Envío Inmediato</h5>
                </div>
                <span className="text-[10px] text-muted-foreground">Verifica que las credenciales funcionen</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder=""
                  className="h-10 rounded-xl text-xs flex-1 bg-background"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="h-10 rounded-xl px-4 text-xs font-semibold flex items-center gap-2 shrink-0 border-border"
                >
                  {testing ? (
                    <>
                      <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="size-3.5 text-primary" />
                      <span>Enviar correo de prueba</span>
                    </>
                  )}
                </Button>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${testResult.success
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300"
                    }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  )}
                  <div className="leading-relaxed">
                    <strong>{testResult.success ? "¡Conexión Verificada!" : "Error de Conexión:"}</strong>{" "}
                    {testResult.message}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 px-6 border-t border-border bg-muted/20 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Lock className="size-3.5 text-emerald-600" />
            <span>Tus claves nunca se expondrán en el cliente web.</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-xl text-xs px-4 border-border"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="h-10 rounded-xl text-xs px-6 font-semibold bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-primary dark:text-primary-foreground shadow-xs flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  <span>Guardar credenciales</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
