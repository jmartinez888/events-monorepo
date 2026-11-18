import { useEffect, useMemo, useState } from "react"
import type { ComponentType, FormEvent, ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { Award, Check, Copy, Eye, EyeOff, Loader2, Mail, PlugZap, QrCode, Radio, Send, Video, WandSparkles } from "lucide-react"
import { toast } from "sonner"
import { api, type PlatformSection, type PlatformSectionKey } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

type FieldKind = "text" | "number" | "url" | "email" | "secret" | "switch" | "select"
interface FieldSpec { name: string; label: string; kind?: FieldKind; hint?: string; placeholder?: string; options?: Array<{ value: string; label: string }>; generate?: boolean; wide?: boolean }
interface GroupSpec { title: string; description?: string; fields: FieldSpec[]; when?: (values: Values) => boolean }
interface SectionSpec { key: PlatformSectionKey; title: string; icon: ComponentType<{ className?: string }>; summary: string; groups: GroupSpec[]; endpoints?: Array<{ key: string; label: string; hint: string }>; testable?: boolean }
type Values = Record<string, string | number | boolean>
interface Draft { enabled: boolean; values: Values; secrets: Record<string, string> }

/** De dónde se lee y dónde se guarda: la plataforma (admin global) o una institución. */
export interface SettingsAdapter {
  list: () => Promise<PlatformSection[]>
  save: (key: PlatformSectionKey, data: { enabled?: boolean; values?: Record<string, unknown>; secrets?: Record<string, string> }) => Promise<PlatformSection>
  test: (key: PlatformSectionKey, recipient?: string) => Promise<{ ok: boolean; message: string }>
  registerTelegramWebhook?: () => Promise<{ ok: boolean; message: string }>
}

/** Entrada de la lista que no usa el formulario genérico (p. ej. el correo de la institución). */
export interface CustomEntry { key: string; title: string; icon: ComponentType<{ className?: string }>; status: { label: string; tone: string }; content: ReactNode }

const SECTIONS: SectionSpec[] = [
  {
    key: "mail", title: "Correo del sistema", icon: Mail, testable: true,
    summary: "Envía los códigos de acceso, contraseñas temporales y avisos de cuenta, que no pertenecen a ninguna institución. Los correos de cada evento salen con el correo de su institución.",
    groups: [
      {
        title: "Remitente", description: "Lo que ven las personas al recibir un correo.",
        fields: [
          { name: "fromEmail", label: "Alias de envío", kind: "email", placeholder: "eventos@iiap.gob.pe", hint: "Dirección que aparece en «De:». Con SMTP puede ser distinta de la cuenta que inicia sesión, siempre que esa cuenta tenga permiso para enviar como este alias (en Gmail: Configuración › Cuentas › Enviar como)." },
          { name: "fromName", label: "Nombre visible", placeholder: "Eventos IIAP" },
          { name: "replyTo", label: "Responder a", kind: "email", placeholder: "informes@iiap.gob.pe", hint: "Opcional. Las respuestas llegan aquí en lugar de al alias." },
        ],
      },
      {
        title: "Servidor SMTP", description: "Google Workspace: smtp.gmail.com, puerto 465 con SSL y una contraseña de aplicación.",
        when: (values) => values.provider !== "RESEND",
        fields: [
          { name: "smtpHost", label: "Servidor", placeholder: "smtp.gmail.com" },
          { name: "smtpPort", label: "Puerto", kind: "number", placeholder: "465" },
          { name: "smtpUser", label: "Cuenta", kind: "email", placeholder: "notificaciones@iiap.gob.pe" },
          { name: "smtpPass", label: "Contraseña", kind: "secret" },
          { name: "smtpSecure", label: "Conexión cifrada (SSL/TLS)", kind: "switch", hint: "Actívala con el puerto 465. Con 587 se negocia STARTTLS." },
        ],
      },
      {
        title: "Resend", when: (values) => values.provider === "RESEND",
        fields: [{ name: "resendApiKey", label: "API key", kind: "secret", wide: true, hint: "El alias de envío debe pertenecer a un dominio verificado en Resend." }],
      },
      {
        title: "Seguimiento y respaldo",
        fields: [
          { name: "trackingBaseUrl", label: "URL pública de seguimiento", kind: "url", placeholder: "https://eventos-api.iiap.gob.pe/api", hint: "Base de los enlaces de apertura, clic y baja. Vacía usa la URL pública de la API." },
          { name: "resendWebhookSecret", label: "Secreto del webhook de Resend", kind: "secret", hint: "Valida los avisos de entrega, rebote y apertura." },
          { name: "organizationFallback", label: "Usar este correo si una institución no tiene el suyo", kind: "switch", wide: true, hint: "Desactivado, los avisos de una institución sin correo propio no se envían hasta que lo configure." },
        ],
      },
    ],
    endpoints: [{ key: "resendWebhook", label: "Webhook de Resend", hint: "Regístralo en Resend para recibir entregas, rebotes y aperturas." }],
  },
  {
    key: "zoom", title: "Zoom", icon: Video, testable: true,
    summary: "Crea una reunión por sesión virtual, registra a cada inscrito con su enlace único e importa la asistencia.",
    groups: [
      {
        title: "App Server-to-Server OAuth", description: "Créala en marketplace.zoom.us con los permisos de reuniones y reportes. El reporte de asistencia exige plan Pro o superior.",
        fields: [
          { name: "accountId", label: "Account ID" },
          { name: "clientId", label: "Client ID" },
          { name: "clientSecret", label: "Client Secret", kind: "secret", wide: true },
        ],
      },
      {
        title: "Reuniones",
        fields: [
          { name: "userId", label: "Usuario anfitrión", placeholder: "me", hint: "Correo o ID del usuario de Zoom que será anfitrión. «me» usa al dueño de la app." },
          { name: "autoRecording", label: "Grabación automática", kind: "select", options: [{ value: "none", label: "Sin grabación" }, { value: "local", label: "En el equipo del anfitrión" }, { value: "cloud", label: "En la nube de Zoom" }] },
          { name: "webhookSecret", label: "Secret Token del webhook", kind: "secret", wide: true, hint: "Lo muestra Zoom en Feature › Event Subscriptions." },
        ],
      },
    ],
    endpoints: [{ key: "webhook", label: "URL de eventos de Zoom", hint: "Suscribe meeting.ended y meeting.updated." }],
  },
  {
    key: "facebook", title: "Facebook Live", icon: Radio, testable: true,
    summary: "Programa una transmisión en la Página y conecta Zoom para emitir en vivo.",
    groups: [
      {
        title: "Página de Facebook",
        fields: [
          { name: "pageId", label: "ID de la Página" },
          { name: "graphVersion", label: "Versión de la Graph API", placeholder: "v21.0" },
          { name: "pageAccessToken", label: "Token de acceso de la Página", kind: "secret", wide: true, hint: "Token de larga duración con permiso publish_video." },
        ],
      },
    ],
  },
  {
    key: "attendance", title: "Sistema de Asistencia", icon: QrCode, testable: true,
    summary: "Crea un evento espejo por sesión presencial y recibe las marcas QR de vuelta en Eventos.",
    groups: [
      {
        title: "Conexión",
        fields: [
          { name: "apiUrl", label: "URL de la API", kind: "url", wide: true, placeholder: "https://api-control.iiap.gob.pe/api", hint: "Incluye https:// y /api." },
          { name: "apiToken", label: "Token de la cuenta de servicio", kind: "secret", wide: true, hint: "access_token de una cuenta con rol ADMIN_EVENTO." },
        ],
      },
      {
        title: "Claves compartidas", description: "Entrégalas al equipo de Asistencia: allá se llaman EVENTOS_WEBHOOK_SECRET y EVENTOS_SERVICE_KEY.",
        fields: [
          { name: "webhookSecret", label: "Secreto de firma de marcas", kind: "secret", generate: true },
          { name: "serviceKey", label: "Clave de servicio", kind: "secret", generate: true },
        ],
      },
    ],
    endpoints: [
      { key: "webhook", label: "Marcas en tiempo real", hint: "Asistencia envía aquí cada marca firmada." },
      { key: "personRegistrations", label: "Registro de personas nuevas", hint: "Asistencia pide aquí inscribir a quien llega sin registro." },
    ],
  },
  {
    key: "certificates", title: "Sistema de Certificados", icon: Award, testable: true,
    summary: "Con URL y clave, la emisión pasa al Sistema de Certificados. Sin ellas, Eventos emite y verifica localmente.",
    groups: [
      {
        title: "Conexión",
        fields: [
          { name: "apiUrl", label: "URL del sistema", kind: "url", wide: true, placeholder: "https://certificados.iiap.gob.pe" },
          { name: "apiKey", label: "API key", kind: "secret", wide: true, hint: "Clave con permiso de emisión (cabecera X-API-Key)." },
        ],
      },
    ],
  },
  {
    key: "telegram", title: "Telegram", icon: Send, testable: true,
    summary: "Bot que envía recordatorios a quienes eligen Telegram como canal.",
    groups: [
      {
        title: "Bot",
        fields: [
          { name: "botUsername", label: "Usuario del bot", placeholder: "EventosIIAPBot", hint: "Sin @. Se usa en el enlace t.me para vincular la cuenta." },
          { name: "botToken", label: "Token del bot", kind: "secret", hint: "Lo entrega @BotFather." },
          { name: "webhookSecret", label: "Secreto del webhook", kind: "secret", generate: true, wide: true },
        ],
      },
    ],
    endpoints: [{ key: "webhook", label: "Webhook del bot", hint: "Guarda el token y el secreto, y registra el webhook con el botón." }],
  },
]

function toDraft(section: PlatformSection): Draft {
  return { enabled: section.enabled, values: { ...section.values }, secrets: {} }
}

function isDirty(section: PlatformSection, draft: Draft) {
  if (draft.enabled !== section.enabled || Object.keys(draft.secrets).length) return true
  return Object.keys(draft.values).some((key) => String(draft.values[key] ?? "") !== String(section.values[key] ?? ""))
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function status(section?: PlatformSection) {
  if (!section) return { label: "Cargando", tone: "bg-muted-foreground/30" }
  if (!section.enabled) return { label: "Desactivado", tone: "bg-muted-foreground/40" }
  if (section.configured) return { label: "Activo", tone: "bg-emerald-500" }
  return { label: section.stored ? "Incompleto" : "Sin configurar", tone: "bg-amber-500" }
}

/** Correo del sistema: solo SUPER_ADMIN, en Administración › Configuración. */
export function PlatformSettingsPanel() {
  const adapter = useMemo<SettingsAdapter>(() => ({ list: api.platformSettings.list, save: api.platformSettings.save, test: api.platformSettings.test }), [])
  return <SettingsPanel adapter={adapter} keys={["mail"]} />
}

/**
 * Lista de servicios + formulario del seleccionado. `keys` decide qué secciones
 * muestra; `custom` agrega entradas propias al inicio de la lista.
 */
export function SettingsPanel({ adapter, keys, custom = [] }: { adapter: SettingsAdapter; keys: PlatformSectionKey[]; custom?: CustomEntry[] }) {
  const [params, setParams] = useSearchParams()
  const [sections, setSections] = useState<PlatformSection[]>([])
  const [drafts, setDrafts] = useState<Partial<Record<PlatformSectionKey, Draft>>>({})
  const [loading, setLoading] = useState(true)
  const specs = SECTIONS.filter((item) => keys.includes(item.key))
  const entries = [...custom.map((item) => item.key), ...specs.map((item) => item.key)]
  const active = entries.find((key) => key === params.get("section")) ?? entries[0]

  useEffect(() => {
    let cancelled = false
    adapter.list()
      .then((data) => {
        if (cancelled) return
        setSections(data)
        setDrafts(Object.fromEntries(data.map((item) => [item.key, toDraft(item)])))
      })
      .catch((error) => { if (!cancelled) toast.error(errorText(error, "No se pudo cargar la configuración")) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [adapter])

  const byKey = useMemo(() => Object.fromEntries(sections.map((item) => [item.key, item])) as Partial<Record<PlatformSectionKey, PlatformSection>>, [sections])
  const customEntry = custom.find((item) => item.key === active)
  const spec = specs.find((item) => item.key === active)
  const section = spec ? byKey[spec.key] : undefined
  const draft = spec ? drafts[spec.key] : undefined

  const replace = (updated: PlatformSection) => {
    setSections((current) => current.map((item) => item.key === updated.key ? updated : item))
    setDrafts((current) => ({ ...current, [updated.key]: toDraft(updated) }))
  }

  const content = customEntry ? customEntry.content
    : loading || !spec || !section || !draft ? <Card className="flex items-center gap-3 p-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Cargando configuración…</Card>
    : <SectionForm key={spec.key} adapter={adapter} spec={spec} section={section} draft={draft} onDraft={(next) => setDrafts((current) => ({ ...current, [spec.key]: next }))} onSaved={replace} />

  // Una sola sección no necesita lista lateral.
  if (entries.length === 1) return content

  const navItems = [
    ...custom.map((item) => ({ key: item.key, title: item.title, icon: item.icon, state: item.status, pending: false })),
    ...specs.map((item) => ({ key: item.key, title: item.title, icon: item.icon, state: status(byKey[item.key]), pending: !!(byKey[item.key] && drafts[item.key] && isDirty(byKey[item.key]!, drafts[item.key]!)) })),
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <nav aria-label="Servicios" className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {navItems.map((item) => {
          const state = item.state
          const current = item.key === active
          const pending = item.pending
          return (
            <button
              key={item.key}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => setParams({ section: item.key }, { replace: true })}
              className={cn(
                "flex min-w-max items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring lg:min-w-0",
                current ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-4 shrink-0", current && "text-primary")} />
              <span className="flex-1">
                <span className="block font-medium">{item.title}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden className={cn("size-1.5 rounded-full", state.tone)} />
                  {pending ? "Cambios sin guardar" : state.label}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="min-w-0">{content}</div>
    </div>
  )
}

function SectionForm({ adapter, spec, section, draft, onDraft, onSaved }: { adapter: SettingsAdapter; spec: SectionSpec; section: PlatformSection; draft: Draft; onDraft: (draft: Draft) => void; onSaved: (section: PlatformSection) => void }) {
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [recipient, setRecipient] = useState("")
  // Al guardar o descartar se reinician los campos secretos (vuelven a mostrarse enmascarados).
  const [resetToken, setResetToken] = useState(0)
  const dirty = isDirty(section, draft)
  const setValue = (name: string, value: string | number | boolean) => onDraft({ ...draft, values: { ...draft.values, [name]: value } })
  const setSecret = (name: string, value: string | undefined) => {
    const secrets = { ...draft.secrets }
    if (value === undefined) delete secrets[name]
    else secrets[name] = value
    onDraft({ ...draft, secrets })
  }

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    setSaving(true)
    try {
      const updated = await adapter.save(spec.key, { enabled: draft.enabled, values: draft.values, secrets: draft.secrets })
      onSaved(updated)
      setResetToken((value) => value + 1)
      toast.success(`${spec.title}: cambios guardados`)
    } catch (error) {
      toast.error(errorText(error, "No se pudieron guardar los cambios"))
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    try {
      const result = await adapter.test(spec.key, recipient.trim() || undefined)
      if (result.ok) toast.success(result.message)
      else toast.warning(result.message)
    } catch (error) {
      toast.error(errorText(error, "La prueba de conexión falló"))
    } finally {
      setTesting(false)
    }
  }

  const registerWebhook = async () => {
    try {
      const result = await adapter.registerTelegramWebhook!()
      toast.success(result.message)
    } catch (error) {
      toast.error(errorText(error, "No se pudo registrar el webhook"))
    }
  }

  const endpoints = (spec.endpoints ?? []).filter((item) => section.endpoints[item.key])

  return (
    <form onSubmit={save} className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h3 className="text-lg font-semibold">{spec.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{spec.summary}</p>
            {section.updatedAt ? <p className="mt-2 text-xs text-muted-foreground">Última modificación: {new Date(section.updatedAt).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" })}</p> : null}
          </div>
          <label className="flex items-center gap-3 text-sm font-medium">
            <span>{draft.enabled ? "Activado" : "Desactivado"}</span>
            <Switch checked={draft.enabled} onCheckedChange={(enabled) => onDraft({ ...draft, enabled })} aria-label={`Activar ${spec.title}`} />
          </label>
        </div>
        {!draft.enabled ? <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">Mientras esté desactivado, la plataforma actúa como si este servicio no estuviera configurado. Los datos guardados se conservan.</p> : null}

        {spec.key === "mail" ? (
          <div className="mt-6">
            <p className="text-sm font-medium">Proveedor</p>
            <div role="radiogroup" aria-label="Proveedor de correo" className="mt-2 inline-grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-1">
              {[{ value: "SMTP", label: "SMTP" }, { value: "RESEND", label: "Resend" }].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.values.provider === option.value}
                  onClick={() => setValue("provider", option.value)}
                  className={cn("rounded-md px-4 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", draft.values.provider === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {spec.groups.filter((group) => !group.when || group.when(draft.values)).map((group) => (
        <Card key={group.title} className="p-6">
          <h4 className="font-semibold">{group.title}</h4>
          {group.description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{group.description}</p> : null}
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {group.fields.map((field) => (
              <FieldControl key={`${field.name}-${resetToken}`} spec={spec} field={field} draft={draft} section={section} setValue={setValue} setSecret={setSecret} />
            ))}
          </div>
          {spec.key === "mail" && group.title === "Remitente" ? <SenderPreview values={draft.values} /> : null}
        </Card>
      ))}

      {endpoints.length ? (
        <Card className="p-6">
          <h4 className="font-semibold">Direcciones para el proveedor</h4>
          <p className="mt-1 text-sm text-muted-foreground">Copia estas URLs en la configuración del servicio externo.</p>
          <ul className="mt-4 divide-y divide-border">
            {endpoints.map((item) => <EndpointRow key={item.key} label={item.label} hint={item.hint} url={section.endpoints[item.key]} />)}
          </ul>
          {spec.key === "telegram" && adapter.registerTelegramWebhook ? <Button type="button" variant="outline" className="mt-4" disabled={dirty || !section.configured} onClick={() => void registerWebhook()}><Send />Registrar webhook en Telegram</Button> : null}
        </Card>
      ) : null}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        {spec.testable ? (
          <div className="mr-auto flex flex-wrap items-center gap-2">
            {spec.key === "mail" ? <Input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Destinatario (por defecto, tu correo)" aria-label="Destinatario de la prueba" className="w-64" /> : null}
            <Button type="button" variant="outline" disabled={testing || dirty} onClick={() => void test()} title={dirty ? "Guarda los cambios antes de probar" : undefined}>
              {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
              {spec.key === "mail" ? "Enviar correo de prueba" : "Probar conexión"}
            </Button>
            {dirty ? <span className="text-xs text-muted-foreground">Guarda para probar con los datos nuevos.</span> : null}
          </div>
        ) : null}
        <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { onDraft(toDraft(section)); setResetToken((value) => value + 1) }}>Descartar</Button>
        <Button type="submit" disabled={!dirty || saving}>{saving ? <Loader2 className="animate-spin" /> : null}Guardar cambios</Button>
      </div>
    </form>
  )
}

function SenderPreview({ values }: { values: Values }) {
  const address = String(values.fromEmail || (values.provider !== "RESEND" ? values.smtpUser : "") || "")
  if (!address) return <p className="mt-5 text-sm text-muted-foreground">Sin alias, se envía desde la cuenta SMTP.</p>
  return (
    <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-3 text-sm">
      <p className="text-muted-foreground">Así lo verán los destinatarios</p>
      <p className="mt-1 font-medium">{String(values.fromName || "Eventos IIAP")} <span className="font-normal text-muted-foreground">&lt;{address}&gt;</span></p>
      {values.replyTo ? <p className="mt-0.5 text-muted-foreground">Las respuestas van a {String(values.replyTo)}</p> : null}
    </div>
  )
}

function FieldControl({ spec, field, draft, section, setValue, setSecret }: { spec: SectionSpec; field: FieldSpec; draft: Draft; section: PlatformSection; setValue: (name: string, value: string | number | boolean) => void; setSecret: (name: string, value: string | undefined) => void }) {
  const id = `${spec.key}-${field.name}`
  const hint = field.hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{field.hint}</p> : null
  const wrapper = cn(field.wide && "md:col-span-2")

  if (field.kind === "switch") {
    return (
      <div className={cn("flex items-start gap-3", wrapper)}>
        <Switch id={id} checked={Boolean(draft.values[field.name])} onCheckedChange={(value) => setValue(field.name, value)} aria-describedby={field.hint ? `${id}-hint` : undefined} className="mt-0.5" />
        <div><label htmlFor={id} className="text-sm font-medium">{field.label}</label>{hint}</div>
      </div>
    )
  }

  if (field.kind === "secret") {
    return <div className={wrapper}><SecretInput id={id} label={field.label} stored={section.secrets[field.name]} pending={draft.secrets[field.name]} generate={field.generate} onChange={(value) => setSecret(field.name, value)} />{hint}</div>
  }

  if (field.kind === "select") {
    return (
      <div className={wrapper}>
        <label htmlFor={id} className="text-sm font-medium">{field.label}</label>
        <select id={id} value={String(draft.values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {hint}
      </div>
    )
  }

  return (
    <div className={wrapper}>
      <label htmlFor={id} className="text-sm font-medium">{field.label}</label>
      <Input
        id={id}
        className="mt-1.5"
        type={field.kind === "number" ? "number" : field.kind === "email" ? "email" : field.kind === "url" ? "url" : "text"}
        inputMode={field.kind === "number" ? "numeric" : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={field.placeholder}
        value={String(draft.values[field.name] ?? "")}
        onChange={(event) => setValue(field.name, field.kind === "number" ? Number(event.target.value || 0) : event.target.value)}
        aria-describedby={field.hint ? `${id}-hint` : undefined}
      />
      {hint}
    </div>
  )
}

/** Un secreto guardado nunca vuelve al navegador: se reemplaza o se quita, no se edita. */
export function SecretInput({ id, label, stored, pending, generate, removable = true, onChange }: { id: string; label: string; stored?: { set: boolean; masked: string }; pending?: string; generate?: boolean; removable?: boolean; onChange: (value: string | undefined) => void }) {
  const [visible, setVisible] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const removing = pending === "" && !replacing
  const showInput = replacing || !stored?.set

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {showInput && !removing ? (
        <div className="mt-1.5 flex gap-2">
          <div className="relative flex-1">
            <Input id={id} type={visible ? "text" : "password"} autoComplete="new-password" spellCheck={false} autoFocus={replacing && !pending} value={pending ?? ""} onChange={(event) => onChange(event.target.value || undefined)} placeholder={stored?.set ? "Escribe el nuevo valor" : "Sin configurar"} className="pr-9 font-mono text-[13px]" />
            <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Ocultar valor" : "Mostrar valor"} className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground">
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {generate ? <Button type="button" variant="outline" size="icon" title="Generar un valor aleatorio" aria-label="Generar un valor aleatorio" onClick={() => { onChange(randomSecret()); setVisible(true) }}><WandSparkles /></Button> : null}
          {stored?.set ? <Button type="button" variant="ghost" onClick={() => { setReplacing(false); onChange(undefined) }}>Cancelar</Button> : null}
        </div>
      ) : (
        <div className="mt-1.5 flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 pl-3 pr-1 text-sm">
          {removing ? <span className="flex-1 text-destructive">Se quitará al guardar</span> : <span className="flex-1 truncate font-mono text-[13px] text-muted-foreground">{stored?.masked || "••••••••"}</span>}
          {removing ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>Deshacer</Button>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setReplacing(true)}>Cambiar</Button>
              {removable ? <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onChange("")}>Quitar</Button> : null}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function EndpointRow({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("No se pudo copiar; selecciona la URL manualmente")
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <code className="mt-1 block truncate text-xs text-foreground/80" title={url}>{url}</code>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-label={`Copiar ${label}`}>
        {copied ? <Check className="text-emerald-600" /> : <Copy />}
        {copied ? "Copiada" : "Copiar"}
      </Button>
    </li>
  )
}
