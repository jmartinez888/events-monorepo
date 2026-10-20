import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { api, ApiError, type EventFile } from "@/api/client"
import { FileRow, FileUploadForm } from "@/components/event-files"

/** Flujos 08 y 09: materiales por sesión/expositor y documentos del evento, con versiones y visibilidad. */
export function EventFilesSection() {
  const { id } = useParams<{ id: string }>()
  const [files, setFiles] = useState<EventFile[] | null>(null)
  const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>([])

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [list, overview] = await Promise.all([api.files.list(id), api.integrations.overview(id)])
      setFiles(list)
      setSessions(overview.sessions.map((session) => ({ id: session.id, title: `${session.title} · ${session.activity.edition.name}` })))
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudieron cargar los archivos")
    }
  }, [id])
  useEffect(() => { void load() }, [load])

  if (!files || !id) return <p className="text-sm text-muted-foreground">Cargando archivos…</p>
  const materials = files.filter((file) => file.scope === "MATERIAL")
  const documents = files.filter((file) => file.scope === "DOCUMENT")

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="border-b border-border pb-3">
        <h3 className="text-lg font-bold">Materiales y documentos</h3>
        <p className="text-xs text-muted-foreground">Los archivos viven en el almacenamiento configurado; las descargas usan enlaces firmados que vencen. Reemplazar crea una versión nueva y eliminar conserva el historial.</p>
      </div>

      <section className="rounded-xl border border-border p-5 space-y-4">
        <div>
          <p className="font-semibold text-sm">Materiales de exposición</p>
          <p className="text-xs text-muted-foreground">Cada expositor también puede subir los suyos desde su perfil, en «Mis ponencias».</p>
        </div>
        {materials.length ? <ul className="divide-y divide-border">{materials.map((file) => <FileRow key={file.id} file={file} onChanged={load} />)}</ul> : <p className="text-xs text-muted-foreground">Sin materiales.</p>}
        <FileUploadForm eventId={id} scope="MATERIAL" sessions={sessions} onUploaded={load} />
      </section>

      <section className="rounded-xl border border-border p-5 space-y-4">
        <div>
          <p className="font-semibold text-sm">Documentos del evento</p>
          <p className="text-xs text-muted-foreground">Acta de acuerdos, programa, memoria y otros.</p>
        </div>
        {documents.length ? <ul className="divide-y divide-border">{documents.map((file) => <FileRow key={file.id} file={file} onChanged={load} />)}</ul> : <p className="text-xs text-muted-foreground">Sin documentos.</p>}
        <FileUploadForm eventId={id} scope="DOCUMENT" onUploaded={load} />
      </section>
    </div>
  )
}
