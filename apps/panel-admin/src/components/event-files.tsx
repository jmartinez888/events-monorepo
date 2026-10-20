import { useRef, useState } from "react"
import { toast } from "sonner"
import { Download, EyeOff, Eye, RefreshCw, Trash2, Upload } from "lucide-react"
import { api, ApiError, type EventFile, type FileVisibility } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"

export const VISIBILITY_LABEL: Record<FileVisibility, string> = { PUBLIC: "Pública", REGISTERED: "Solo inscritos", PRIVATE: "Privada (organización)" }
const ACCEPT = ".pdf,.ppt,.pptx,.doc,.docx,.odp,.odt,.png,.jpg,.jpeg"
const message = (error: unknown) => (error instanceof ApiError ? error.message : "No se pudo completar la operación.")
const size = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`)

/** Abre la descarga con un enlace firmado que vence en minutos. */
export async function downloadFile(fileId: string, version?: number) {
  try {
    const link = await api.files.download(fileId, version)
    window.open(link.url, "_blank", "noopener")
  } catch (error) {
    toast.error(message(error))
  }
}

interface UploadProps {
  eventId: string
  scope: "MATERIAL" | "DOCUMENT"
  sessions?: Array<{ id: string; title: string }>
  fixed?: { sessionId: string; sessionSpeakerId?: string }
  onUploaded: () => void
}

export function FileUploadForm({ eventId, scope, sessions = [], fixed, onUploaded }: UploadProps) {
  const input = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState("")
  const [visibility, setVisibility] = useState<FileVisibility>(scope === "MATERIAL" ? "REGISTERED" : "PRIVATE")
  const [sessionId, setSessionId] = useState(fixed?.sessionId ?? "")
  const [documentType, setDocumentType] = useState("ACTA")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const file = input.current?.files?.[0]
    if (!file) return toast.error("Selecciona un archivo")
    if (!title.trim()) return toast.error("Escribe un título")
    if (scope === "MATERIAL" && !sessionId) return toast.error("Elige la sesión")
    setBusy(true)
    try {
      await api.files.upload(eventId, file, { scope, title: title.trim(), visibility, sessionId: scope === "MATERIAL" ? sessionId : undefined, sessionSpeakerId: fixed?.sessionSpeakerId, documentType: scope === "DOCUMENT" ? documentType : undefined })
      toast.success("Archivo subido")
      setTitle("")
      if (input.current) input.current.value = ""
      onUploaded()
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-dashed border-border p-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
      <Field className="lg:col-span-2">
        <FieldLabel htmlFor={`title-${scope}`}>Título</FieldLabel>
        <Input id={`title-${scope}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={scope === "MATERIAL" ? "Diapositivas de la ponencia" : "Acta de acuerdos firmada"} />
      </Field>
      {scope === "MATERIAL" && !fixed ? (
        <Field>
          <FieldLabel htmlFor="file-session">Sesión</FieldLabel>
          <select id="file-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="">Elegir…</option>
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
          </select>
        </Field>
      ) : null}
      {scope === "DOCUMENT" ? (
        <Field>
          <FieldLabel htmlFor="file-type">Tipo</FieldLabel>
          <select id="file-type" value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="ACTA">Acta</option>
            <option value="PROGRAMA">Programa</option>
            <option value="MEMORIA">Memoria</option>
            <option value="OTRO">Otro</option>
          </select>
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`visibility-${scope}`}>Visibilidad</FieldLabel>
        <select id={`visibility-${scope}`} value={visibility} onChange={(e) => setVisibility(e.target.value as FileVisibility)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          {(Object.keys(VISIBILITY_LABEL) as FileVisibility[]).map((key) => <option key={key} value={key}>{VISIBILITY_LABEL[key]}</option>)}
        </select>
      </Field>
      <Field className="sm:col-span-2 lg:col-span-5 flex-row items-center gap-2">
        <input ref={input} type="file" accept={ACCEPT} aria-label="Archivo" className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5" />
        <Button type="button" size="sm" disabled={busy} onClick={submit}><Upload className="size-4 mr-1.5" />{busy ? "Subiendo…" : "Subir"}</Button>
      </Field>
    </div>
  )
}

/** Fila de archivo: versión vigente, visibilidad, reemplazo (nueva versión), ocultar y borrado lógico. */
export function FileRow({ file, onChanged }: { file: EventFile; onChanged: () => void }) {
  const replaceInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const current = file.versions[0]
  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try { await action(); toast.success(success); onChanged() } catch (error) { toast.error(message(error)) } finally { setBusy(false) }
  }
  const speaker = file.speaker?.profile ? `${file.speaker.profile.firstName ?? ""} ${file.speaker.profile.lastName ?? ""}`.trim() : null
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{file.title}</p>
        <p className="text-xs text-muted-foreground">
          {[file.documentType, file.session?.title, speaker, current ? `${current.fileName} · ${size(current.size)}` : null, `v${file.currentVersion}`].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {file.status === "HIDDEN" ? <Badge variant="outline">Oculto</Badge> : null}
        <select aria-label={`Visibilidad de ${file.title}`} value={file.visibility} disabled={busy} onChange={(e) => void act(() => api.files.update(file.id, { visibility: e.target.value as FileVisibility }), "Visibilidad actualizada")} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
          {(Object.keys(VISIBILITY_LABEL) as FileVisibility[]).map((key) => <option key={key} value={key}>{VISIBILITY_LABEL[key]}</option>)}
        </select>
        <Button type="button" size="icon" variant="ghost" aria-label="Descargar" onClick={() => void downloadFile(file.id)}><Download className="size-4" /></Button>
        <input ref={replaceInput} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const next = e.target.files?.[0]; if (next) void act(() => api.files.replace(file.id, next), "Nueva versión guardada"); e.target.value = "" }} />
        <Button type="button" size="icon" variant="ghost" aria-label="Reemplazar (nueva versión)" disabled={busy} onClick={() => replaceInput.current?.click()}><RefreshCw className="size-4" /></Button>
        <Button type="button" size="icon" variant="ghost" aria-label={file.status === "HIDDEN" ? "Mostrar" : "Ocultar"} disabled={busy} onClick={() => void act(() => api.files.update(file.id, { status: file.status === "HIDDEN" ? "ACTIVE" : "HIDDEN" }), file.status === "HIDDEN" ? "Archivo visible" : "Archivo oculto")}>
          {file.status === "HIDDEN" ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Eliminar" disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar «${file.title}»? Se conserva el historial de versiones.`)) void act(() => api.files.update(file.id, { status: "DELETED" }), "Archivo eliminado") }}><Trash2 className="size-4 text-destructive" /></Button>
      </div>
    </li>
  )
}
