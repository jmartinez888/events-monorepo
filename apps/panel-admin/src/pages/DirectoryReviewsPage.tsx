import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { GitMerge, Split } from "lucide-react"
import { api, ApiError } from "@/api/client"
import { useAuthStore } from "@/store/auth.store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/page-header"

const person = (profile: any) => profile ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() || "Sin nombre" : "Perfil eliminado"
const identity = (profile: any) => [profile?.primaryEmail, profile?.identityDocumentNumber ? `${profile.identityDocumentType ?? "DOC"} ${profile.identityDocumentNumber}` : null, profile?.authUserId ? "con cuenta" : null].filter(Boolean).join(" · ")

/**
 * Posibles duplicados del Directorio (flujos 02 y 06). La inscripción ya se hizo
 * con un perfil provisional; aquí se decide si es la misma persona.
 */
export function DirectoryReviewsPage() {
  const organization = useAuthStore((state) => state.selectedOrganization)
  const [status, setStatus] = useState<"OPEN" | "RESOLVED">("OPEN")
  const [reviews, setReviews] = useState<any[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!organization) return
    try { setReviews(await api.directory.reviews(organization.id, status)) } catch (error) { toast.error(error instanceof ApiError ? error.message : "No se pudieron cargar las revisiones") }
  }, [organization, status])
  useEffect(() => { void load() }, [load])

  const resolve = async (id: string, action: "KEEP_SEPARATE" | "MERGE", targetProfileId?: string) => {
    setBusy(true)
    try {
      await api.directory.resolve(id, { action, targetProfileId })
      toast.success(action === "MERGE" ? "Perfiles fusionados" : "Se mantienen como personas distintas")
      await load()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo resolver")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Revisión de duplicados" description="Inscripciones cuyos datos coinciden parcialmente con otra persona del Directorio. Nada se fusiona sin tu decisión." />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={status === "OPEN" ? "default" : "outline"} onClick={() => setStatus("OPEN")}>Pendientes</Button>
        <Button type="button" size="sm" variant={status === "RESOLVED" ? "default" : "outline"} onClick={() => setStatus("RESOLVED")}>Resueltas</Button>
      </div>
      {!reviews ? <p className="text-sm text-muted-foreground">Cargando…</p> : !reviews.length ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{status === "OPEN" ? "No hay posibles duplicados pendientes." : "Sin revisiones resueltas."}</p>
      ) : reviews.map((review) => (
        <section key={review.id} className="rounded-xl border border-border p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{review.reason}</p>
            <div className="flex items-center gap-2">
              {review.resolution ? <Badge variant="secondary">{review.resolution.startsWith("MERGE") ? "Fusionado" : "Personas distintas"}</Badge> : null}
              <span className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleString("es-PE", { timeZone: "America/Lima" })}</span>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs uppercase text-muted-foreground mb-1">Datos recibidos (perfil provisional)</p>
              <p className="font-medium">{person(review.provisional ?? review.submitted)}</p>
              <p className="text-xs text-muted-foreground">{identity(review.provisional) || [review.submitted.email, review.submitted.documentNumber].filter(Boolean).join(" · ")}</p>
              {review.provisional?.participants?.length ? <p className="text-xs mt-1">Inscrito en: {review.provisional.participants.map((item: any) => item.edition.mainEvent.eventName).join(", ")}</p> : null}
            </div>
            <div className="space-y-2">
              {review.candidates.map((candidate: any) => (
                <div key={candidate.id} className="rounded-lg border border-border p-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground mb-1">Persona existente</p>
                    <p className="font-medium">{person(candidate)}</p>
                    <p className="text-xs text-muted-foreground">{identity(candidate)}</p>
                  </div>
                  {status === "OPEN" ? <Button type="button" size="sm" disabled={busy} onClick={() => { if (window.confirm(`¿Fusionar con ${person(candidate)}? Las inscripciones del perfil provisional pasarán a esta persona.`)) void resolve(review.id, "MERGE", candidate.id) }}><GitMerge className="size-4 mr-1.5" />Es la misma persona</Button> : null}
                </div>
              ))}
            </div>
          </div>
          {status === "OPEN" ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void resolve(review.id, "KEEP_SEPARATE")}><Split className="size-4 mr-1.5" />Son personas distintas</Button> : null}
        </section>
      ))}
    </div>
  )
}
