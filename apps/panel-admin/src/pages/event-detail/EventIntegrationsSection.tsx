import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, PlayCircle, RefreshCw, XCircle } from "lucide-react"
import { api, ApiError, type EventSettings, type IntegrationsOverview, type SyncState } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

const message = (error: unknown) => (error instanceof ApiError ? error.message : "No se pudo completar la operación.")
const when = (value: string | null) => (value ? new Date(value).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" }) : "Sin horario")

/** ISO a "AAAA-MM-DDTHH:mm" en hora de Lima, para inputs datetime-local. */
const toLimaInput = (value: string | null) => {
  if (!value) return ""
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))
  return parts.replace(" ", "T")
}

/** Horario y modalidad de la sesión: sin horario no hay reunión de Zoom, recordatorios ni espejo de Asistencia. */
function SessionSchedule({ session, onSaved }: { session: IntegrationsOverview["sessions"][number]; onSaved: () => Promise<void> }) {
  const [startsAt, setStartsAt] = useState(toLimaInput(session.startsAt))
  const [endsAt, setEndsAt] = useState(toLimaInput(session.endsAt))
  const [modality, setModality] = useState(session.modality ?? "")
  const [saving, setSaving] = useState(false)
  const dirty = startsAt !== toLimaInput(session.startsAt) || endsAt !== toLimaInput(session.endsAt) || modality !== (session.modality ?? "")
  const save = async () => {
    setSaving(true)
    try {
      // Sin zona horaria: la API lo interpreta como hora de Perú.
      await api.content.updateSession(session.id, { startsAt: startsAt || null, endsAt: endsAt || null, modality: modality || null })
      toast.success("Horario guardado; se sincroniza con Zoom, Asistencia y recordatorios")
      await onSaved()
    } catch (error) {
      toast.error(message(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label className="flex flex-col gap-1">Inicio<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2" /></label>
      <label className="flex flex-col gap-1">Fin<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2" /></label>
      <label className="flex flex-col gap-1">Modalidad
        <select value={modality} onChange={(e) => setModality(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2">
          <option value="">La del evento</option>
          <option value="PHYSICAL">Presencial</option>
          <option value="ONLINE">Virtual</option>
          <option value="HYBRID">Híbrida</option>
        </select>
      </label>
      {dirty ? <Button type="button" size="sm" disabled={saving} onClick={save}>{saving ? "Guardando…" : "Guardar horario"}</Button> : null}
    </div>
  )
}

function SyncBadge({ state, error, label }: { state?: SyncState; error?: string | null; label: string }) {
  const value = state ?? "DISABLED"
  const icon = value === "SYNCED" ? <CheckCircle2 className="size-3" /> : value === "ERROR" ? <XCircle className="size-3" /> : value === "PENDING" ? <RefreshCw className="size-3" /> : <CircleDashed className="size-3" />
  const variant = value === "ERROR" ? "destructive" : value === "SYNCED" ? "default" : "outline"
  return <Badge variant={variant} title={error ?? undefined} className="gap-1">{icon}{label}</Badge>
}

/**
 * Configuración por evento (flujos 01, 03, 04 y 07): modo de asistencia virtual,
 * umbral, aforo, recordatorios y conexión con Zoom, Facebook Live y Asistencia.
 */
export function EventIntegrationsSection() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<IntegrationsOverview | null>(null)
  const [draft, setDraft] = useState<EventSettings | null>(null)
  const [offsets, setOffsets] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const overview = await api.integrations.overview(id)
      setData(overview)
      setDraft(overview.settings)
      setOffsets(overview.settings.reminderOffsets.join(", "))
    } catch (error) {
      toast.error(message(error))
    }
  }, [id])
  useEffect(() => { void load() }, [load])

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true)
    try { await action(); if (success) toast.success(success); await load() } catch (error) { toast.error(message(error)) } finally { setBusy(false) }
  }

  if (!data || !draft || !id) return <p className="text-sm text-muted-foreground">Cargando integraciones…</p>
  const set = <K extends keyof EventSettings>(key: K, value: EventSettings[K]) => setDraft({ ...draft, [key]: value })
  const save = () => run(async () => {
    const reminderOffsets = offsets.split(/[,\s]+/).filter(Boolean).map(Number).filter((value) => Number.isFinite(value) && value > 0)
    await api.integrations.updateSettings(id, { ...draft, reminderOffsets, capacity: draft.capacity || null })
  }, "Configuración guardada")
  const providers = data.providers

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="text-lg font-bold">Asistencia, recordatorios e integraciones</h3>
          <p className="text-xs text-muted-foreground">Eventos es la fuente de verdad: Zoom, Facebook y Asistencia reciben copias y se sincronizan con reintentos.</p>
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => api.integrations.syncNow(id), "Sincronización ejecutada")}><RefreshCw className="size-4 mr-1.5" />Sincronizar ahora</Button>
      </div>

      <section className="rounded-xl border border-border p-5 space-y-5">
        <p className="font-semibold text-sm">Asistencia virtual</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="attendance-mode">Modo</FieldLabel>
            <select id="attendance-mode" value={draft.virtualAttendanceMode} onChange={(e) => set("virtualAttendanceMode", e.target.value as EventSettings["virtualAttendanceMode"])} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="MANUAL">Manual: el organizador aprueba en bloque</option>
              <option value="AUTOMATIC">Automático: reporte de Zoom (requiere plan de pago)</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="threshold">Permanencia mínima (%)</FieldLabel>
            <Input id="threshold" type="number" min={0} max={100} value={Math.round(draft.attendanceThreshold * 100)} onChange={(e) => set("attendanceThreshold", Math.min(100, Math.max(0, Number(e.target.value))) / 100)} />
            <FieldDescription className="text-xs">Aplica al modo automático y al cálculo por sesiones de eventos multi-sesión.</FieldDescription>
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-border p-5 space-y-5">
        <p className="font-semibold text-sm">Inscripción y recordatorios</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="capacity">Aforo por edición</FieldLabel>
            <Input id="capacity" type="number" min={1} placeholder="Sin límite" value={draft.capacity ?? ""} onChange={(e) => set("capacity", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field className="flex-row items-center gap-3 pt-6">
            <Switch id="waitlist" checked={draft.waitlistEnabled} onCheckedChange={(value) => set("waitlistEnabled", value)} />
            <FieldLabel htmlFor="waitlist">Lista de espera al llenarse</FieldLabel>
          </Field>
          <Field>
            <FieldLabel htmlFor="offsets">Recordatorios (minutos antes)</FieldLabel>
            <Input id="offsets" value={offsets} onChange={(e) => setOffsets(e.target.value)} placeholder="60, 1440" />
            <FieldDescription className="text-xs">60 = una hora antes; 1440 = un día antes. La confirmación se envía al inscribirse.</FieldDescription>
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-border p-5 space-y-4">
        <p className="font-semibold text-sm">Conexiones</p>
        {([
          ["zoomEnabled", "Zoom", "Reunión por sesión virtual o híbrida y enlace único por inscrito.", providers.zoom],
          ["facebookLiveEnabled", "Facebook Live", "Transmisión desde Zoom a la Página por RTMPS.", providers.facebook],
          ["attendanceMirrorEnabled", "Asistencia (QR presencial)", "Evento espejo en el sistema de Asistencia; las marcas vuelven a Eventos.", providers.attendance],
        ] as const).map(([key, label, description, configured]) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Switch id={key} checked={draft[key]} onCheckedChange={(value) => set(key, value)} />
              <div>
                <label htmlFor={key} className="text-sm font-medium">{label}</label>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
            {configured ? <Badge variant="secondary">Credenciales configuradas</Badge> : <Badge variant="outline" className="gap-1"><AlertTriangle className="size-3" />Falta configurar en el servidor</Badge>}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Certificados externos: {providers.certificates ? "conectado" : "emisión local"} · Telegram: {providers.telegram ? "bot activo" : "no configurado"} · Almacenamiento: {providers.storage}</p>
      </section>

      <div className="flex justify-end"><Button type="button" disabled={busy} onClick={save}>Guardar configuración</Button></div>

      <section className="rounded-xl border border-border p-5 space-y-3">
        <p className="font-semibold text-sm">Sesiones</p>
        {!data.sessions.length ? <p className="text-xs text-muted-foreground">Crea sesiones con fecha y hora en la Agenda para sincronizarlas.</p> : (
          <ul className="divide-y divide-border">
            {data.sessions.map((session) => {
              const integration = session.integration
              const registrants = session.registrants.reduce((sum, item) => sum + item.count, 0)
              const failed = session.registrants.find((item) => item.status === "ERROR")?.count ?? 0
              return (
                <li key={session.id} className="py-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{session.title}</p>
                      <p className="text-xs text-muted-foreground">{session.activity.edition.name} · {when(session.startsAt)} · {session.modality ?? draft.eventMode ?? "Modalidad del evento"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <SyncBadge label="Zoom" state={integration?.zoomStatus} error={integration?.zoomError} />
                      <SyncBadge label="Facebook" state={integration?.facebookStatus} error={integration?.facebookError} />
                      <SyncBadge label="Asistencia" state={integration?.attendanceStatus} error={integration?.attendanceError} />
                    </div>
                  </div>
                  <SessionSchedule session={session} onSaved={load} />
                  {[integration?.zoomError, integration?.facebookError, integration?.attendanceError].filter(Boolean).map((error) => <p key={error} className="text-xs text-destructive">{error}</p>)}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {integration?.zoomMeetingId ? <span className="text-muted-foreground">Reunión {integration.zoomMeetingId} · enlaces únicos: {registrants}{failed ? ` (${failed} con error)` : ""}</span> : null}
                    {integration?.zoomMeetingId ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => window.open((await api.integrations.hostStartUrl(session.id)).startUrl, "_blank", "noopener"))}><PlayCircle className="size-4 mr-1" />Iniciar como anfitrión</Button> : null}
                    {integration?.facebookLiveUrl ? <a href={integration.facebookLiveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"><ExternalLink className="size-3" />Live</a> : null}
                    {integration?.zoomMeetingId && draft.virtualAttendanceMode === "AUTOMATIC" ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { const result = await api.integrations.importZoom(session.id); toast.success(`${result.people} personas, ${result.valid} válidas, ${result.createdFromOpenRegistration} sin inscripción previa`) })}>Importar asistencia de Zoom</Button> : null}
                    {integration?.attendanceEventId ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { const result = await api.integrations.reconcileAttendance(session.id); toast.success(`${result.attendees} marcas reconciliadas`) })}>Reconciliar QR</Button> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {data.failedJobs.length ? (
        <section className="rounded-xl border border-destructive/40 p-5 space-y-3">
          <p className="font-semibold text-sm">Operaciones fallidas</p>
          <ul className="divide-y divide-border text-xs">
            {data.failedJobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><strong>{job.kind}</strong> · {job.attempts} intentos · {job.lastError}</span>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => api.integrations.retryJob(job.id), "Reintento ejecutado")}>Reintentar</Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
