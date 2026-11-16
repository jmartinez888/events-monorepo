import { useEffect, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { Loader2, PlugZap, Plus, RefreshCw, RotateCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { SecretInput } from "@/pages/admin/PlatformSettingsPanel"

type Provider = "RESEND" | "GMAIL_SMTP" | "CUSTOM_SMTP"
interface Sender { email: string; name?: string; label?: string }
interface Form {
  provider: Provider
  resendDomain: string; resendFromEmail: string; resendFromName: string
  smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpFromEmail: string; smtpFromName: string
  replyTo: string
  verifiedSenders: Sender[]
}
interface Secrets { resendApiKey?: string; resendWebhookSecret?: string; smtpPass?: string }
interface Stored { resendApiKey: string; resendWebhookSecret: string; smtpPass: string }
interface Webhook { id: string; status?: string; endpoint?: string }

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message) || fallback
const stored = (masked: string) => ({ set: Boolean(masked), masked })

/** Correo de la institución, en línea con el resto de Integraciones (sin modal). */
export function OrgMailSettingsForm({ organizationId, organizationName, defaultRecipient, onSaved }: { organizationId: string; organizationName: string; defaultRecipient?: string; onSaved?: () => void }) {
  const [initial, setInitial] = useState<Form | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [masked, setMasked] = useState<Stored>({ resendApiKey: "", resendWebhookSecret: "", smtpPass: "" })
  const [secrets, setSecrets] = useState<Secrets>({})
  const [needsRotation, setNeedsRotation] = useState(false)
  const [resetToken, setResetToken] = useState(0)
  const [version, setVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [recipient, setRecipient] = useState(defaultRecipient || "")
  const [newSender, setNewSender] = useState({ email: "", label: "" })

  useEffect(() => {
    let cancelled = false
    api.emailSettings.get(organizationId).then((data) => {
      if (cancelled) return
      const next: Form = {
        provider: data.defaultProvider || "RESEND",
        resendDomain: data.resendDomain || "",
        resendFromEmail: data.resendFromEmail || "",
        resendFromName: data.resendFromName || organizationName,
        smtpHost: data.smtpHost || "",
        smtpPort: data.smtpPort || 587,
        smtpSecure: Boolean(data.smtpSecure),
        smtpUser: data.smtpUser || "",
        smtpFromEmail: data.smtpFromEmail || "",
        smtpFromName: data.smtpFromName || organizationName,
        replyTo: data.replyTo || "",
        verifiedSenders: Array.isArray(data.verifiedSenders) ? data.verifiedSenders : data.resendFromEmail ? [{ email: data.resendFromEmail, name: data.resendFromName, label: "Principal" }] : [],
      }
      setInitial(next)
      setForm(next)
      setSecrets({})
      setMasked({ resendApiKey: data.resendApiKeyMasked || "", resendWebhookSecret: data.resendWebhookSecretMasked || "", smtpPass: data.smtpPassMasked || "" })
      setNeedsRotation(Boolean(data.credentialNeedsRotation))
    }).catch((error) => { if (!cancelled) toast.error(errorText(error, "No se pudo cargar la configuración de correo")) })
    return () => { cancelled = true }
  }, [organizationId, organizationName, version])

  if (!form || !initial) {
    return <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Cargando correo…</Card>
  }

  const isResend = form.provider === "RESEND"
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || Object.values(secrets).some((value) => value !== undefined)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value })
  const fromEmail = isResend ? form.resendFromEmail : form.smtpFromEmail || form.smtpUser
  const fromName = isResend ? form.resendFromName : form.smtpFromName

  const save = async (event: FormEvent) => {
    event.preventDefault()
    try {
      setSaving(true)
      await api.emailSettings.save(organizationId, {
        defaultProvider: form.provider,
        resendApiKey: secrets.resendApiKey?.trim() || undefined,
        resendWebhookSecret: secrets.resendWebhookSecret?.trim() || undefined,
        resendDomain: form.resendDomain.trim() || undefined,
        resendFromEmail: form.resendFromEmail.trim() || undefined,
        resendFromName: form.resendFromName.trim() || undefined,
        smtpHost: form.smtpHost.trim() || undefined,
        smtpPort: Number(form.smtpPort) || 587,
        smtpSecure: form.smtpSecure,
        smtpUser: form.smtpUser.trim() || undefined,
        smtpPass: secrets.smtpPass?.trim() || undefined,
        smtpFromEmail: form.smtpFromEmail.trim() || undefined,
        smtpFromName: form.smtpFromName.trim() || undefined,
        replyTo: form.replyTo.trim(),
        verifiedSenders: form.verifiedSenders,
        isActive: true,
      })
      toast.success("Correo guardado")
      setResetToken((value) => value + 1)
      setVersion((value) => value + 1)
      onSaved?.()
    } catch (error) {
      toast.error(errorText(error, "No se pudo guardar el correo"))
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    if (!recipient.includes("@")) return toast.error("Escribe un correo de destino válido")
    try {
      setTesting(true)
      const result = await api.emailSettings.test(organizationId, { recipientEmail: recipient.trim(), provider: form.provider })
      toast.success(result?.message || "Correo de prueba enviado")
    } catch (error) {
      toast.error(errorText(error, "No se pudo enviar el correo de prueba"))
    } finally {
      setTesting(false)
    }
  }

  const addSender = () => {
    const email = newSender.email.trim()
    if (!email.includes("@")) return toast.error("Escribe un correo de remitente válido")
    if (form.verifiedSenders.some((sender) => sender.email.toLowerCase() === email.toLowerCase())) return toast.error("Ese remitente ya está en la lista")
    set("verifiedSenders", [...form.verifiedSenders, { email, name: form.resendFromName || organizationName, label: newSender.label.trim() || "Adicional" }])
    setNewSender({ email: "", label: "" })
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold">Correo de {organizationName}</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Cuenta con la que salen las confirmaciones, recordatorios, certificados y campañas de los eventos de esta institución.</p>
        {needsRotation ? <p className="mt-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">Las credenciales guardadas se cifraron con una clave anterior. Vuelve a escribir la API key o la contraseña SMTP y guarda.</p> : null}
        <div className="mt-6">
          <p className="text-sm font-medium">Proveedor</p>
          <div role="radiogroup" aria-label="Proveedor de correo" className="mt-2 inline-grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-1">
            {[{ value: "GMAIL_SMTP" as Provider, label: "SMTP / Gmail" }, { value: "RESEND" as Provider, label: "Resend" }].map((option) => {
              const active = option.value === "RESEND" ? isResend : !isResend
              return (
                <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => set("provider", option.value)}
                  className={cn("rounded-md px-4 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      </Card>

      {isResend ? (
        <Card className="p-6">
          <h4 className="font-semibold">Cuenta de Resend</h4>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Crea la API key en <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">resend.com/api-keys</a> con permiso de envío sobre el dominio verificado.</p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <SecretInput key={`rk-${resetToken}`} id="org-mail-resend-key" label="API key" stored={stored(masked.resendApiKey)} pending={secrets.resendApiKey} removable={false} onChange={(value) => setSecrets({ ...secrets, resendApiKey: value })} />
            <Field id="org-mail-domain" label="Dominio verificado" value={form.resendDomain} placeholder="iiap.gob.pe" onChange={(value) => set("resendDomain", value)} />
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <h4 className="font-semibold">Servidor SMTP</h4>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Con Gmail o Google Workspace usa smtp.gmail.com y una <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">contraseña de aplicación</a>, no la contraseña personal.</p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field id="org-mail-host" label="Servidor" value={form.smtpHost} placeholder="smtp.gmail.com" onChange={(value) => set("smtpHost", value)} />
            <Field id="org-mail-port" label="Puerto" type="number" value={String(form.smtpPort)} onChange={(value) => set("smtpPort", Number(value || 0))} hint="587 con STARTTLS; 465 con conexión segura." />
            <Field id="org-mail-user" label="Usuario" value={form.smtpUser} placeholder="eventos@iiap.gob.pe" onChange={(value) => set("smtpUser", value)} />
            <SecretInput key={`sp-${resetToken}`} id="org-mail-smtp-pass" label="Contraseña" stored={stored(masked.smtpPass)} pending={secrets.smtpPass} removable={false} onChange={(value) => setSecrets({ ...secrets, smtpPass: value })} />
            <div className="flex items-start gap-3 md:col-span-2">
              <Switch id="org-mail-secure" checked={form.smtpSecure} onCheckedChange={(value) => set("smtpSecure", value)} className="mt-0.5" />
              <label htmlFor="org-mail-secure" className="text-sm font-medium">Conexión segura (SSL/TLS directo)<span className="block text-xs font-normal text-muted-foreground">Actívalo con el puerto 465.</span></label>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h4 className="font-semibold">Remitente</h4>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">El alias es la dirección que ven los destinatarios en «De:». {isResend ? "Debe pertenecer al dominio verificado." : "Puede ser distinto del usuario SMTP si la cuenta tiene permiso para enviar como ese alias (en Gmail, «Enviar como»)."}</p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field id="org-mail-from-name" label="Nombre visible" value={fromName} placeholder={organizationName} onChange={(value) => set(isResend ? "resendFromName" : "smtpFromName", value)} />
          <Field id="org-mail-from-email" label="Alias de envío (De:)" type="email" value={isResend ? form.resendFromEmail : form.smtpFromEmail} placeholder={isResend ? "eventos@iiap.gob.pe" : form.smtpUser || "eventos@iiap.gob.pe"} onChange={(value) => set(isResend ? "resendFromEmail" : "smtpFromEmail", value)} />
          <Field id="org-mail-reply-to" label="Responder a" type="email" value={form.replyTo} placeholder="informes@iiap.gob.pe" onChange={(value) => set("replyTo", value)} hint="Opcional. Las respuestas llegan aquí en lugar del alias." />
        </div>
        {fromEmail ? (
          <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-3 text-sm">
            <p className="text-muted-foreground">Así lo verán los destinatarios</p>
            <p className="mt-1 font-medium">{fromName || organizationName} <span className="font-normal text-muted-foreground">&lt;{fromEmail}&gt;</span></p>
            {form.replyTo ? <p className="mt-0.5 text-muted-foreground">Las respuestas van a {form.replyTo}</p> : null}
          </div>
        ) : null}
      </Card>

      {isResend ? (
        <Card className="p-6">
          <h4 className="font-semibold">Otros remitentes</h4>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Aparecen como opciones al elegir el remitente de una plantilla.</p>
          {form.verifiedSenders.length ? (
            <ul className="mt-4 divide-y divide-border">
              {form.verifiedSenders.map((sender, index) => (
                <li key={sender.email} className="flex items-center gap-3 py-2.5 text-sm first:pt-0">
                  <span className="min-w-0 flex-1 truncate font-medium">{sender.email}</span>
                  {sender.label ? <span className="text-xs text-muted-foreground">{sender.label}</span> : null}
                  <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${sender.email}`} onClick={() => set("verifiedSenders", form.verifiedSenders.filter((_, i) => i !== index))}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input aria-label="Correo del remitente" type="email" placeholder="difusion@iiap.gob.pe" value={newSender.email} onChange={(event) => setNewSender({ ...newSender, email: event.target.value })} className="flex-1" />
            <Input aria-label="Etiqueta" placeholder="Etiqueta (opcional)" value={newSender.label} onChange={(event) => setNewSender({ ...newSender, label: event.target.value })} className="sm:w-48" />
            <Button type="button" variant="outline" onClick={addSender}><Plus />Añadir</Button>
          </div>
        </Card>
      ) : null}

      {isResend ? <ResendTracking organizationId={organizationId} secret={<SecretInput key={`ws-${resetToken}`} id="org-mail-webhook-secret" label="Secreto del webhook (whsec_…)" stored={stored(masked.resendWebhookSecret)} pending={secrets.resendWebhookSecret} removable={false} onChange={(value) => setSecrets({ ...secrets, resendWebhookSecret: value })} />} onChanged={() => setVersion((value) => value + 1)} /> : null}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mr-auto flex flex-wrap items-center gap-2">
          <Input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Destinatario de la prueba" aria-label="Destinatario de la prueba" className="w-64" />
          <Button type="button" variant="outline" disabled={testing || dirty} onClick={() => void test()} title={dirty ? "Guarda los cambios antes de probar" : undefined}>
            {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}Enviar correo de prueba
          </Button>
          {dirty ? <span className="text-xs text-muted-foreground">Guarda para probar con los datos nuevos.</span> : null}
        </div>
        <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setForm(initial); setSecrets({}); setResetToken((value) => value + 1) }}>Descartar</Button>
        <Button type="submit" disabled={!dirty || saving}>{saving ? <Loader2 className="animate-spin" /> : null}Guardar cambios</Button>
      </div>
    </form>
  )
}

function Field({ id, label, value, onChange, type = "text", placeholder, hint }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input id={id} className="mt-1.5" type={type} inputMode={type === "number" ? "numeric" : undefined} autoComplete="off" spellCheck={false} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Webhook de Resend para entregas, rebotes y quejas. Se gestiona directo contra Resend. */
function ResendTracking({ organizationId, secret, onChanged }: { organizationId: string; secret: ReactNode; onChanged: () => void }) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [managedId, setManagedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.emailSettings.webhooks(organizationId)
      .then((result) => { if (!cancelled) { setWebhooks(Array.isArray(result?.data) ? result.data : []); setManagedId(result?.managedWebhookId || null) } })
      .catch(() => { if (!cancelled) setWebhooks([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [organizationId, refresh])

  const run = async (key: string, action: () => Promise<unknown>, done: string, failed: string) => {
    try {
      setBusy(key)
      await action()
      toast.success(done)
      setLoading(true)
      setRefresh((value) => value + 1)
      onChanged()
    } catch (error) {
      toast.error(errorText(error, failed))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h4 className="font-semibold">Seguimiento de entregas</h4>
          <p className="mt-1 text-sm text-muted-foreground">Resend avisa de entregas, rebotes y quejas. Las aperturas y clics los mide la plataforma.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => { setLoading(true); setRefresh((value) => value + 1) }}><RefreshCw className={cn(loading && "animate-spin")} />Actualizar</Button>
      </div>
      <div className="mt-5 max-w-md">{secret}<p className="mt-1.5 text-xs text-muted-foreground">Si creas el webhook desde aquí, el secreto se guarda solo.</p></div>
      {webhooks.length ? (
        <ul className="mt-5 divide-y divide-border">
          {webhooks.map((webhook) => (
            <li key={webhook.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{webhook.id === managedId ? "Webhook de esta plataforma" : "Webhook"} <span className={cn("font-normal", webhook.status === "disabled" ? "text-muted-foreground" : "text-emerald-600")}>{webhook.status === "disabled" ? "inactivo" : "activo"}</span></p>
                <code className="mt-1 block truncate text-xs text-foreground/80" title={webhook.endpoint}>{webhook.endpoint}</code>
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void run(`rotate:${webhook.id}`, () => api.emailSettings.rotateWebhookSecret(organizationId, webhook.id), "Secreto rotado", "No se pudo rotar el secreto")}><RotateCw />Rotar secreto</Button>
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => { if (window.confirm("¿Eliminar este webhook de Resend? Se dejarán de recibir sus eventos.")) void run(`delete:${webhook.id}`, () => api.emailSettings.removeWebhook(organizationId, webhook.id), "Webhook eliminado", "No se pudo eliminar el webhook") }}><Trash2 />Eliminar</Button>
            </li>
          ))}
        </ul>
      ) : !loading ? (
        <Button type="button" variant="outline" className="mt-5" disabled={busy !== null} onClick={() => void run("create", () => api.emailSettings.createWebhook(organizationId), "Webhook creado; su secreto quedó guardado", "No se pudo crear el webhook en Resend")}>
          {busy === "create" ? <Loader2 className="animate-spin" /> : null}Crear webhook en Resend
        </Button>
      ) : null}
    </Card>
  )
}
