import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useEventStore } from "@/store/event.store"
import { Plus, Trash2, ExternalLink, Eye, RefreshCw, Search, X, Download } from "lucide-react"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ExcelJS from "exceljs"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { useSEO } from "@/hooks/use-seo"
import { PageHeader } from "@/components/page-header"
import { api } from "@/api/client"
import { useAuthStore } from "@/store/auth.store"
import { Badge } from "@/components/ui/badge"
import { Field, FieldLabel } from "@/components/ui/field"
import { ParticipantRolesControl } from "./ParticipantRolesControl"

export function EventAttendeesSection() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { events, editions, attendees, roles, deleteAttendee, loadData } = useEventStore()
  const selectedOrganization = useAuthStore((state) => state.selectedOrganization)
  const currentUser = useAuthStore((state) => state.user)
  const [forms, setForms] = useState<any[]>([])
  const [formFilter, setFormFilter] = useState("ALL")
  const [editionFilter, setEditionFilter] = useState("ALL")
  const [search, setSearch] = useState("")
  const [serverAttendees, setServerAttendees] = useState<any[] | null>(null)
  const [totalAttendees, setTotalAttendees] = useState(0)
  const page = Math.max(Number(searchParams.get("page")) || 1, 1)
  const [detailAttendee, setDetailAttendee] = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [canManageAttendees, setCanManageAttendees] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [attendanceNote, setAttendanceNote] = useState("")
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [loadError, setLoadError] = useState("")

  const event = events.find((e) => e.id === id)
  const eventAttendees = serverAttendees !== null ? serverAttendees.map((item) => ({
    ...item,
    fullName: item.name,
    email: item.email || "",
    registrationDate: item.registeredAt,
    source: item.submissionId ? "FORM" : "MANUAL",
    ticketType: item.type,
    // Compatibilidad con respuestas de API previas y actuales.
    answers: item.answers || item.attributes || {},
    formFields: item.formFields || Object.entries(item.attributeLabels || {}).map(([key, label]) => ({ key, label })),
  })) : attendees.filter((at) => at.eventId === id)
  const filteredAttendees = eventAttendees.filter((attendee) => {
    const matchesOrigin = formFilter === "ALL" || (formFilter === "MANUAL" ? attendee.source !== "FORM" : attendee.sourceFormId === formFilter)
    const matchesEdition = editionFilter === "ALL" || attendee.editionId === editionFilter
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [attendee.fullName, attendee.email, attendee.ticketType, attendee.sourceFormTitle].filter(Boolean).some((value) => String(value).toLowerCase().includes(term))
    return matchesOrigin && matchesEdition && matchesSearch
  })
  const eventEditions = editions.filter((ed) => ed.mainEventId === id)
  const eventRoles = roles.filter((role) => role.mainEventId === id)
  const selectableIds = filteredAttendees.filter((attendee) => attendee.participantId || !String(attendee.id).startsWith("form:")).map((attendee) => attendee.id)
  const query = searchParams.get("q") || ""
  const reloadAttendees = useCallback(async () => {
    if (!id) return
    const result = await api.events.attendees(id, query, page)
    setServerAttendees(result.items)
    setTotalAttendees(result.total)
    setLoadError("")
  }, [id, query, page])

  useSEO({
    title: event ? `${event.name} - Participantes` : "Participantes de Evento",
    description: `Administración de la lista de asistentes inscritos, entradas de cortesía, VIP, generales y control de asistencia (check-in) para el evento ${event?.name || ""}.`
  })

  useEffect(() => {
    if (!id) return
    api.registrationForms.list(id).then((loadedForms) => {
      setForms(loadedForms)
      const mainForm = loadedForms.find((form) => form.purpose === "MAIN" && form.status !== "ARCHIVED")
      setFormFilter(mainForm?.id || "ALL")
    }).catch(() => setForms([]))
  }, [id])

  useEffect(() => {
    const activeEdition = editions.find((edition) => edition.mainEventId === id && edition.isCurrent)
    if (activeEdition) setEditionFilter(activeEdition.id)
  }, [id, editions])

  // The event shell can already be loaded while its participant collection is stale.
  // Refresh this module's source data every time the event changes.
  useEffect(() => {
    const organizationId = event?.organizationId || selectedOrganization?.id
    if (id && organizationId) void loadData(organizationId)
  }, [id, event?.organizationId, selectedOrganization?.id, loadData])

  useEffect(() => {
    let active = true
    if (!id) return
    setSearch(query)
    setSelectedIds([])
    void api.events.attendees(id, query, page).then((result) => {
      if (!active) return
      setServerAttendees(result.items); setTotalAttendees(result.total); setLoadError("")
    }).catch((error: Error) => { if (active) setLoadError(error.message || "No se pudo cargar la lista") })
    return () => { active = false }
  }, [id, page, query])

  useEffect(() => { setSelectedIds([]) }, [formFilter, editionFilter])

  useEffect(() => {
    const organizationId = event?.organizationId || selectedOrganization?.id
    if (!organizationId) return
    if (["SUPER_ADMIN", "SAAS_ADMIN"].includes(currentUser?.role || "")) {
      setCanManageAttendees(true)
      return
    }
    void api.organizations.access(organizationId)
      .then((access) => setCanManageAttendees(["OWNER", "ADMIN"].includes(access.role)))
      .catch(() => setCanManageAttendees(false))
  }, [event?.organizationId, selectedOrganization?.id, currentUser?.role])

  const removeAttendee = async (attendee: any) => {
    try {
      if (attendee.source === "FORM" && attendee.submissionId) {
        await api.registrationForms.removeSubmission(attendee.submissionId)
        if (event?.organizationId) await loadData(event.organizationId)
      } else {
        await deleteAttendee(attendee.id)
      }
      toast.success("Inscripción eliminada")
      await reloadAttendees()
    } catch (error: any) {
      toast.error(error?.message || "No se pudo eliminar la inscripción")
    }
  }

  const refreshAttendees = async () => {
    if (!event?.organizationId) return
    setRefreshing(true)
    try {
      await loadData(event.organizationId)
      await reloadAttendees()
      toast.success("Lista de participantes actualizada")
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar la lista")
    } finally {
      setRefreshing(false)
    }
  }

  const changeParticipantRoles = async (attendee: any, roleIds: string[]) => {
    try {
      await api.participants.setRoles(attendee.id, roleIds)
      await reloadAttendees()
      if (event?.organizationId) await loadData(event.organizationId)
      toast.success("Rol actualizado")
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cambiar el rol")
    }
  }

  const approveAttendance = async (valid: boolean, participantIds = selectedIds) => {
    if (!id || !participantIds.length || savingAttendance) return
    setSavingAttendance(true)
    try {
      const result = await api.attendance.approveBulk(id, participantIds, valid, attendanceNote.trim() || undefined)
      await reloadAttendees()
      setSelectedIds([])
      setAttendanceNote("")
      toast.success(`${result.changed} asistencia(s) ${valid ? "aprobada(s)" : "retirada(s)"}`)
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar la asistencia")
    } finally { setSavingAttendance(false) }
  }

  const exportAttendees = async () => {
    if (!id) return
    const exportRows = await api.events.attendeeExport(id)
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Participantes")
    const attributeKeys = [...new Set(exportRows.flatMap((attendee) => Object.keys(attendee.attributes || {})))].filter((key) => !["first_name", "firstName", "last_name", "lastName", "nombres", "apellidos", "surname", "full_name", "name", "email"].includes(key))
    sheet.columns = [
      { header: "Participante", key: "name", width: 32 }, { header: "Correo", key: "email", width: 36 },
      { header: "Edición", key: "edition", width: 24 }, { header: "Origen", key: "source", width: 26 },
      { header: "Tipo", key: "type", width: 18 }, { header: "Registro", key: "registeredAt", width: 16 },
      ...attributeKeys.map((key) => ({ header: exportRows.find((attendee) => attendee.attributeLabels?.[key])?.attributeLabels?.[key] || key, key: `attribute:${key}`, width: 24 })),
    ]
    exportRows.forEach((attendee) => sheet.addRow({ ...attendee, registeredAt: attendee.registeredAt ? new Date(attendee.registeredAt).toLocaleDateString("es-PE") : "", ...Object.fromEntries(attributeKeys.map((key) => [`attribute:${key}`, Array.isArray(attendee.attributes?.[key]) ? attendee.attributes[key].join(", ") : String(attendee.attributes?.[key] ?? "")])) }))
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } }
    headerRow.alignment = { vertical: "middle" }
    headerRow.height = 24
    const file = new Blob([await workbook.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(file)
    const anchor = document.createElement("a")
    anchor.href = url; anchor.download = `participantes-${event?.name?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "evento"}.xlsx`; anchor.click()
    URL.revokeObjectURL(url)
  }


  const columns: ColumnDef<any>[] = [
    ...(canManageAttendees ? [{
      header: <input type="checkbox" aria-label="Seleccionar participantes de esta página" checked={selectableIds.length > 0 && selectableIds.every((value) => selectedIds.includes(value))} disabled={savingAttendance || !selectableIds.length || !!loadError} onChange={(event) => setSelectedIds(event.target.checked ? selectableIds : [])} />,
      cell: (at: any) => <input type="checkbox" aria-label={`Seleccionar a ${at.fullName}`} checked={selectedIds.includes(at.id)} disabled={savingAttendance || !selectableIds.includes(at.id) || !!loadError} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, at.id] : current.filter((value) => value !== at.id))} />,
    }] : []),
    {
      header: "Participante",
      className: "p-3",
      headerClassName: "p-3",
      cell: (at) => {
        const avatarUrl = at.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(at.fullName || "User")}`
        return (
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <img
                src={avatarUrl}
                alt={at.fullName}
                className="size-9 rounded-full border border-border/80 object-cover bg-muted shadow-xs"
              />
              {(!at.email || !at.identityDocumentNumber) && (
                <span
                  className="absolute -top-0.5 -right-0.5 size-3.5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-background shadow-xs select-none cursor-help animate-pulse"
                  title={
                    !at.email && !at.identityDocumentNumber
                      ? "Falta registrar correo electrónico y número de documento"
                      : !at.email
                      ? "Falta registrar correo electrónico"
                      : "Falta registrar número de documento"
                  }
                >
                  !
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-sm text-foreground truncate">{at.fullName || "Participante"}</h4>
              {at.email ? (
                <p className="text-xs text-muted-foreground truncate">{at.email}</p>
              ) : (
                <p className="text-xs text-amber-500 italic truncate">Sin correo registrado</p>
              )}
            </div>
          </div>
        )
      }
    },
    {
      header: "Origen",
      className: "p-3",
      headerClassName: "p-3",
      cell: (at) => (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${at.source === "FORM" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-muted text-muted-foreground"}`}>
          {at.source === "FORM" ? `${at.sourceFormPurpose === "MAIN" ? "Registro principal" : "Formulario"}: ${at.sourceFormTitle}` : "Manual"}
        </span>
      )
    },
    {
      header: "Edición",
      className: "p-3 text-xs",
      headerClassName: "p-3",
      cell: (at) => {
        const ed = eventEditions.find((e) => e.id === at.editionId)
        return ed ? (
          <span className="font-medium text-foreground">
            {ed.name}
          </span>
        ) : (
          <span className="text-muted-foreground italic text-[11px]">Global (Todas)</span>
        )
      }
    },
    {
      header: "Registrado",
      className: "p-3 whitespace-nowrap",
      headerClassName: "p-3",
      cell: (at) => {
        const registeredAt = at.registrationDate ? new Date(at.registrationDate) : null
        if (!registeredAt || Number.isNaN(registeredAt.getTime())) {
          return <span className="text-xs text-muted-foreground">—</span>
        }

        return (
          <div className="text-xs leading-5">
            <div className="font-medium text-foreground">
              {registeredAt.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Lima" })}
            </div>
            <div className="text-muted-foreground">
              {registeredAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" })}
            </div>
          </div>
        )
      }
    },
    {
      header: "Rol",
      className: "p-3",
      headerClassName: "p-3",
      cell: (at) => canManageAttendees && selectableIds.includes(at.id) ? <ParticipantRolesControl participant={at} roles={eventRoles} onChange={(roleIds) => changeParticipantRoles(at, roleIds)} /> : <span className="text-xs text-muted-foreground">{at.ticketType || "Sin rol"}</span>,
    },
    {
      header: "Asistencia",
      cell: (at) => <div className="flex flex-col gap-1">
        <Badge variant={at.checkedIn ? "default" : "secondary"}>{at.checkedIn ? "Válida" : "Sin aprobar"}</Badge>
        {at.attendance?.approvedAt ? <span className="text-xs text-muted-foreground">{new Date(at.attendance.approvedAt).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}</span> : null}
        {canManageAttendees && selectableIds.includes(at.id) ? <Button variant="ghost" size="sm" disabled={savingAttendance || !!loadError} onClick={() => void approveAttendance(!at.checkedIn, [at.id])}>{at.checkedIn ? "Retirar" : "Aprobar"}</Button> : null}
      </div>,
    },
    {
      header: "Acciones",
      headerClassName: "text-right p-3",
      className: "text-right p-3",
      cell: (at) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="ghost" className="size-7 p-0 text-muted-foreground hover:text-foreground" title="Ver detalle" onClick={() => setDetailAttendee(at)}><Eye className="size-3.5" /></Button>
          {at.profileId && (
            <Button
              asChild
              variant="ghost"
              className="size-7 p-0 text-muted-foreground hover:text-foreground"
              title="Gestionar Perfil Completo"
            >
              <a
                href={`/dashboard/profiles/${at.profileId}/info`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex size-7 shrink-0 items-center justify-center"
              >
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
          {canManageAttendees && <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="size-7 p-0 text-destructive hover:bg-destructive/10">
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar participante?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminará permanentemente "{at.fullName}". Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => removeAttendee(at)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Sí, eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>}
        </div>
      )
    }
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Participantes"
        description="Gestiona y acredita a los asistentes registrados en el evento."
        actionButton={
          <Button onClick={() => navigate("new")} className="text-xs px-3 py-1.5 h-8">
            <Plus className="size-4 mr-1.5" />
            Inscribir Participante
          </Button>
        }
      />

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={(input) => { const value = input.target.value; setSearch(value); const next = new URLSearchParams(searchParams); if (value.trim()) next.set("q", value.trim()); else next.delete("q"); next.set("page", "1"); setSearchParams(next) }} placeholder="Buscar por participante, correo o tipo..." className="h-9 pl-9" /></div>
          <select value={formFilter} onChange={(event) => setFormFilter(event.target.value)} aria-label="Filtrar por origen" className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground">
          <option value="ALL">Todos los orígenes</option>
          <option value="MANUAL">Participantes manuales</option>
          {forms.map((form) => <option key={form.id} value={form.id}>{form.purpose === "MAIN" ? "Registro principal" : "Formulario"}: {form.title}</option>)}
          </select>
          <select value={editionFilter} onChange={(event) => setEditionFilter(event.target.value)} aria-label="Filtrar por edición" className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground"><option value="ALL">Todas las ediciones</option>{eventEditions.map((edition) => <option key={edition.id} value={edition.id}>{edition.name}</option>)}</select>
          <Button type="button" variant="outline" onClick={() => void exportAttendees()} disabled={!filteredAttendees.length} className="h-9 gap-2 text-xs"><Download className="size-4" />Exportar Excel</Button>
          <Button type="button" variant="outline" size="icon" onClick={() => void refreshAttendees()} disabled={refreshing} title="Actualizar lista" aria-label="Actualizar lista de participantes" className="size-9"><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /></Button>
        </div>
        {(search || formFilter !== "ALL" || editionFilter !== "ALL") && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Filtros activos:</span>{search && <button type="button" onClick={() => setSearch("")} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">Búsqueda: {search}<X className="size-3" /></button>}{formFilter !== "ALL" && <button type="button" onClick={() => setFormFilter("ALL")} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">Origen seleccionado<X className="size-3" /></button>}{editionFilter !== "ALL" && <button type="button" onClick={() => setEditionFilter("ALL")} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">Edición: {eventEditions.find((edition) => edition.id === editionFilter)?.name}<X className="size-3" /></button>}<button type="button" onClick={() => { setSearch(""); setFormFilter("ALL"); setEditionFilter("ALL") }} className="ml-1 font-medium text-primary hover:underline">Limpiar todo</button></div>}
      </div>

      {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
      {canManageAttendees ? <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1 text-sm"><strong>{selectedIds.length} seleccionado(s)</strong><span className="text-xs text-muted-foreground">Selección de esta página. Cada cambio conserva su historial.</span></div>
        <Field className="min-w-48 flex-1">
          <FieldLabel htmlFor="attendanceNote">Motivo o evidencia (opcional)</FieldLabel>
          <Input id="attendanceNote" maxLength={1000} value={attendanceNote} onChange={(event) => setAttendanceNote(event.target.value)} placeholder="Lista verificada por el organizador" disabled={savingAttendance} />
        </Field>
        <Button disabled={!selectedIds.length || savingAttendance || !!loadError} onClick={() => void approveAttendance(true)}>{savingAttendance ? "Guardando…" : "Aprobar asistencia"}</Button>
        <Button variant="outline" disabled={!selectedIds.length || savingAttendance || !!loadError} onClick={() => void approveAttendance(false)}>Retirar aprobación</Button>
      </div> : null}

      {filteredAttendees.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
          No hay participantes inscritos.
        </div>
      ) : (
        <DataTable columns={columns} data={filteredAttendees} containerClassName="border border-border rounded-xl bg-card" pagination={{ page, pageSize: 20, totalItems: totalAttendees, itemLabel: "participantes", onPageChange: (nextPage) => { const next = new URLSearchParams(searchParams); next.set("page", String(nextPage)); setSearchParams(next) } }} />
      )}
      <AlertDialog open={!!detailAttendee} onOpenChange={(open) => !open && setDetailAttendee(null)}><AlertDialogContent className="max-w-lg"><AlertDialogHeader><AlertDialogTitle>Detalle de {detailAttendee?.fullName}</AlertDialogTitle><AlertDialogDescription>{detailAttendee?.sourceFormTitle || "Registro de participante"}</AlertDialogDescription></AlertDialogHeader><div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border p-3 text-sm"><div className="grid grid-cols-2 gap-3 border-b pb-2"><span className="font-medium text-muted-foreground">Correo</span><span className="break-words">{detailAttendee?.email || "—"}</span></div><div className="grid grid-cols-2 gap-3 border-b pb-2"><span className="font-medium text-muted-foreground">Edición</span><span>{eventEditions.find((edition) => edition.id === detailAttendee?.editionId)?.name || "Global"}</span></div>{Object.entries(detailAttendee?.answers || {}).map(([key, value]) => <div key={key} className="grid grid-cols-2 gap-3 border-b pb-2 last:border-0"><span className="font-medium text-muted-foreground">{detailAttendee?.formFields?.find((field: any) => field.key === key)?.label || key}</span><span className="break-words">{Array.isArray(value) ? value.join(", ") : String(value || "—")}</span></div>)}</div><AlertDialogFooter><AlertDialogCancel>Cerrar</AlertDialogCancel></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  )
}
