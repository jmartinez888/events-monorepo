import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { Award, CheckCircle2, ShieldCheck, Users } from "lucide-react"
import { api, ApiError } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  CONFIRMED: { label: "Confirmada", variant: "default" },
  PREREGISTERED: { label: "Preinscrita", variant: "secondary" },
  WAITLISTED: { label: "Lista de espera", variant: "outline" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
}
const ORIGIN: Record<string, string> = { FORM: "Formulario", MANUAL: "Alta manual", SPEAKER: "Ponente", OPEN_REGISTRATION: "Registro abierto (Zoom)", ONSITE: "Registro en sede", IMPORT: "Importación" }
const CERT: Record<string, string> = { PENDING: "En emisión", ISSUED: "Emitido", FAILED: "Falló", REVOKED: "Revocado", SUPERSEDED: "Reemplazado" }

const message = (error: unknown) => (error instanceof ApiError ? error.message : "No se pudo completar la operación.")

/**
 * Inscripciones con estado, origen y enlaces únicos (flujo 02), y emisión de
 * certificados por rol con aprobación directa auditada (flujos 04 y 05).
 */
export function EventRegistrationsSection() {
  const { id } = useParams<{ id: string }>()
  const [rows, setRows] = useState<any[] | null>(null)
  const [filter, setFilter] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [roleId, setRoleId] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try { setRows(await api.registrations.list(id, filter || undefined)) } catch (error) { toast.error(message(error)) }
  }, [id, filter])
  useEffect(() => { void load() }, [load])

  const roles = useMemo(() => {
    const map = new Map<string, any>()
    for (const row of rows ?? []) for (const assignment of row.roleAssignments) map.set(assignment.role.id, assignment.role)
    return [...map.values()]
  }, [rows])
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (rows ?? []).filter((row) => !term || [row.profile.firstName, row.profile.lastName, row.profile.primaryEmail, row.profile.identityDocumentNumber].some((value) => String(value ?? "").toLowerCase().includes(term)))
  }, [rows, search])

  const run = async (action: () => Promise<unknown>, success?: (result: any) => string) => {
    setBusy(true)
    try { const result = await action(); if (success) toast.success(success(result)); await load() } catch (error) { toast.error(message(error)) } finally { setBusy(false) }
  }
  const toggle = (participantId: string) => setSelected((current) => { const next = new Set(current); if (next.has(participantId)) next.delete(participantId); else next.add(participantId); return next })
  const ids = [...selected]

  if (!rows || !id) return <p className="text-sm text-muted-foreground">Cargando inscripciones…</p>
  const counts = rows.reduce<Record<string, number>>((acc, row) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc }, {})

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="text-lg font-bold">Inscripciones y certificados por rol</h3>
          <p className="text-xs text-muted-foreground">{Object.entries(counts).map(([status, count]) => `${STATUS[status]?.label ?? status}: ${count}`).join(" · ") || "Sin inscripciones"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.WAITLISTED ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => api.registrations.promoteWaitlist(id), (r) => `${r.promoted} personas confirmadas desde la lista de espera`)}><Users className="size-4 mr-1.5" />Promover lista de espera</Button> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar por nombre, correo o documento" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-72" />
        <select aria-label="Filtrar por estado" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
      </div>

      <section className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-semibold">Acciones sobre {ids.length} seleccionadas</p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Rol" value={roleId} onChange={(e) => setRoleId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="">Todos sus roles</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.displayName || role.name}{role.requiresAttendance ? " · requiere asistencia" : ""}</option>)}
          </select>
          <Button type="button" size="sm" disabled={busy || !ids.length} onClick={() => void run(() => api.eventCertificates.issue(id, { participantIds: ids, roleIds: roleId ? [roleId] : undefined }), (r) => `${r.issued} emitidos, ${r.pending} en emisión, ${r.skipped.length} omitidos${r.skipped[0] ? ` (${r.skipped[0].reason})` : ""}`)}><Award className="size-4 mr-1.5" />Emitir certificados</Button>
          <Input aria-label="Motivo de aprobación directa" placeholder="Motivo de la aprobación directa" value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-72" />
          <Button type="button" size="sm" variant="outline" disabled={busy || !ids.length || !roleId || !reason.trim()} onClick={() => void run(() => api.eventCertificates.directApproval(id, { participantIds: ids, roleId, approved: true, reason }), (r) => `${r.updated} aprobaciones directas registradas`)}><ShieldCheck className="size-4 mr-1.5" />Aprobar sin asistencia</Button>
        </div>
        <p className="text-xs text-muted-foreground">La aprobación directa (atajo del flujo 04) habilita el certificado del rol elegido sin asistencia válida y queda registrada con autor, fecha y motivo.</p>
      </section>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-2"><input type="checkbox" aria-label="Seleccionar todas" checked={visible.length > 0 && visible.every((row) => selected.has(row.id))} onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((row) => row.id)) : new Set())} /></th>
              <th className="p-2 text-left">Persona</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Origen</th>
              <th className="p-2 text-left">Roles</th>
              <th className="p-2 text-left">Zoom</th>
              <th className="p-2 text-left">Certificados</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((row) => {
              const zoomErrors = row.sessionRegistrations.filter((item: any) => item.status === "ERROR").length
              const zoomOk = row.sessionRegistrations.filter((item: any) => item.status === "SYNCED").length
              return (
                <tr key={row.id}>
                  <td className="p-2 text-center"><input type="checkbox" aria-label={`Seleccionar ${row.profile.firstName}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td>
                  <td className="p-2">
                    <p className="font-medium">{row.profile.firstName} {row.profile.lastName}</p>
                    <p className="text-xs text-muted-foreground">{row.profile.primaryEmail}{row.profile.identityDocumentNumber ? ` · ${row.profile.identityDocumentType ?? ""} ${row.profile.identityDocumentNumber}` : ""} · {row.edition.name}</p>
                  </td>
                  <td className="p-2"><Badge variant={STATUS[row.status]?.variant ?? "outline"}>{STATUS[row.status]?.label ?? row.status}</Badge></td>
                  <td className="p-2 text-xs">{ORIGIN[row.origin] ?? row.origin}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">{row.roleAssignments.map((assignment: any) => (
                      <Badge key={assignment.roleId} variant="secondary" title={assignment.directApprovalReason ? `Aprobación directa: ${assignment.directApprovalReason}` : undefined}>
                        {assignment.role.displayName || assignment.role.name}{assignment.directApprovedAt ? " ✓" : ""}
                      </Badge>
                    ))}</div>
                  </td>
                  <td className="p-2 text-xs">{row.sessionRegistrations.length ? `${zoomOk} enlaces${zoomErrors ? ` · ${zoomErrors} con error` : ""}` : "—"}</td>
                  <td className="p-2 text-xs">
                    {row.certificates.length ? row.certificates.map((certificate: any) => {
                      const role = roles.find((item) => item.id === certificate.roleId)
                      return (
                        <div key={certificate.id} className="flex items-center gap-1">
                          <span>{role?.displayName || role?.name || "Rol"} v{certificate.version}: {CERT[certificate.status] ?? certificate.status}</span>
                          {certificate.status === "ISSUED" ? <button type="button" className="text-primary underline" disabled={busy} onClick={() => { const why = window.prompt("Motivo de la reemisión (corrección)"); if (why !== null) void run(() => api.eventCertificates.reissue(certificate.id, why), () => "Nueva versión emitida") }}>reemitir</button> : null}
                          {certificate.status === "ISSUED" ? <button type="button" className="text-destructive underline" disabled={busy} onClick={() => { const why = window.prompt("Motivo de la revocación"); if (why !== null) void run(() => api.eventCertificates.revoke(certificate.id, why), () => "Certificado revocado") }}>revocar</button> : null}
                          {certificate.status === "FAILED" ? <button type="button" className="text-primary underline" disabled={busy} onClick={() => void run(() => api.eventCertificates.retry(certificate.id), () => "Reintento en curso")}>reintentar</button> : null}
                        </div>
                      )
                    }) : "—"}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    {row.status === "WAITLISTED" || row.status === "CANCELLED" ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => api.registrations.confirm(row.id), () => "Inscripción confirmada")}><CheckCircle2 className="size-4 mr-1" />Confirmar</Button> : null}
                    {row.status !== "CANCELLED" ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm("¿Cancelar esta inscripción? Se liberará su cupo.")) void run(() => api.registrations.cancel(row.id), (r) => `Cancelada${r.promoted ? ` · ${r.promoted} confirmada(s) desde la lista de espera` : ""}`) }}>Cancelar</Button> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!visible.length ? <p className="p-6 text-center text-sm text-muted-foreground">Sin inscripciones para este filtro.</p> : null}
      </div>
    </div>
  )
}
