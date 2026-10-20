import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Presentation } from "lucide-react"
import { api, ApiError } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { FileRow, FileUploadForm } from "@/components/event-files"

const ROLE_LABEL: Record<string, string> = { SPEAKER: "Expositor", CO_SPEAKER: "Coexpositor", MODERATOR: "Moderador" }

/** Flujo 08: el expositor entra con su cuenta y gestiona solo los materiales de sus sesiones. */
export function ProfileTalksSection() {
  const [talks, setTalks] = useState<any[] | null>(null)
  const load = useCallback(async () => {
    try { setTalks(await api.files.mySpeakerSessions()) } catch (error) { toast.error(error instanceof ApiError ? error.message : "No se pudieron cargar tus ponencias") }
  }, [])
  useEffect(() => { void load() }, [load])

  if (!talks) return <p className="text-sm text-muted-foreground">Cargando ponencias…</p>
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="border-b border-border pb-3">
        <h3 className="text-lg font-bold">Mis ponencias</h3>
        <p className="text-xs text-muted-foreground">Sesiones en las que figuras como expositor. Sube tus materiales (PDF, PPT, PPTX) y elige quién puede descargarlos.</p>
      </div>
      {!talks.length ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Presentation className="mx-auto mb-2 size-6" />
          Aún no figuras como expositor en ninguna sesión. El equipo organizador te asigna desde la agenda del evento.
        </div>
      ) : talks.map((talk) => {
        const event = talk.session.activity.edition.mainEvent
        return (
          <section key={talk.id} className="rounded-xl border border-border p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{talk.session.title}</p>
                <p className="text-xs text-muted-foreground">
                  {event.eventName} · {talk.session.activity.edition.name}
                  {talk.session.startsAt ? ` · ${new Date(talk.session.startsAt).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" })}` : ""}
                </p>
              </div>
              <Badge variant="secondary">{ROLE_LABEL[talk.role] ?? talk.role}</Badge>
            </div>
            {talk.files.length ? <ul className="divide-y divide-border">{talk.files.map((file: any) => <FileRow key={file.id} file={file} onChanged={load} />)}</ul> : <p className="text-xs text-muted-foreground">Sin materiales todavía.</p>}
            <FileUploadForm eventId={event.id} scope="MATERIAL" fixed={{ sessionId: talk.session.id, sessionSpeakerId: talk.id }} onUploaded={load} />
          </section>
        )
      })}
    </div>
  )
}
