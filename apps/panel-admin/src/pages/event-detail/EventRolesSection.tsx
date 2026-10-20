import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { z } from "zod"
import { useEventStore } from "@/store/event.store"
import type { ParticipantRole } from "@/store/event.store"
import { Plus, Trash2, Edit, Shield, Sparkles, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
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

// Predefined colors for role badges
const PRESETS_COLORS = [
  { name: "Azul", hex: "#3b82f6" },
  { name: "Esmeralda", hex: "#10b981" },
  { name: "Rojo", hex: "#ef4444" },
  { name: "Violeta", hex: "#8b5cf6" },
  { name: "Naranja", hex: "#f97316" },
  { name: "Rosa", hex: "#ec4899" },
]

// Default suggestions
const SUGGESTIONS = [
  {
    nameEs: "Ponente",
    nameEn: "Speaker",
    slug: "speaker",
    badgeColor: "#3b82f6",
    description: "Para expositores de charlas o talleres."
  },
  {
    nameEs: "Participante",
    nameEn: "Attendee",
    slug: "participant",
    badgeColor: "#10b981",
    description: "Para asistentes generales del evento."
  },
  {
    nameEs: "Coordinador",
    nameEn: "Coordinator",
    slug: "coordinator",
    badgeColor: "#ef4444",
    description: "Para el personal de coordinación."
  },
  {
    nameEs: "Ponente Magistral",
    nameEn: "Keynote Speaker",
    slug: "speaker_mg",
    badgeColor: "#8b5cf6",
    description: "Para conferencistas principales del evento."
  }
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .substring(0, 80)
}

import { useSEO } from "@/hooks/use-seo"
import { PageHeader } from "@/components/page-header"
import { toast } from "sonner"

export function EventRolesSection() {
  const { id } = useParams<{ id: string }>()
  const { events, roles, editions, loadRoles, addRole, updateRole, deleteRole } = useEventStore()

  const event = events.find((e) => e.id === id)
  const eventRoles = roles.filter((r) => r.mainEventId === id)
  const eventEditions = editions.filter((ed) => ed.mainEventId === id)
  const currentEdition = eventEditions.find((ed) => ed.isCurrent)

  useSEO({
    title: event ? `${event.name} - Roles` : "Roles de Participantes",
    description: `Configura los roles personalizados de participación, credenciales, colores identificativos y privilegios para el evento ${event?.name || ""}.`
  })

  const availableSuggestions = SUGGESTIONS.filter((sug) => !eventRoles.some((role) => {
    const identities = [role.slug, role.name?.es, role.name?.en]
      .filter(Boolean)
      .map((value) => slugify(String(value)))
    return identities.includes(sug.slug) || identities.includes(slugify(sug.nameEs)) || identities.includes(slugify(sug.nameEn))
  }))

  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Form fields
  const [nameEs, setNameEs] = useState("")
  const [nameEn, setNameEn] = useState("")
  const [slug, setSlug] = useState("")
  const [badgeColor, setBadgeColor] = useState("#3b82f6")
  const [isEditionSpecific, setIsEditionSpecific] = useState(false)
  const [selectedEditionId, setSelectedEditionId] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [autoSlug, setAutoSlug] = useState(true)
  const [formError, setFormError] = useState("")
  const [certificateHours, setCertificateHours] = useState(0)
  const [requiresAttendance, setRequiresAttendance] = useState(true)
  const [certificateText, setCertificateText] = useState("")
  const [isSpeaker, setIsSpeaker] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load roles on mount
  useEffect(() => {
    if (id) {
      loadRoles(id)
    }
  }, [id, loadRoles])

  // Automatically update selectedEditionId when switch is toggled and a current edition exists
  useEffect(() => {
    if (isEditionSpecific && currentEdition && !selectedEditionId) {
      setSelectedEditionId(currentEdition.id)
    }
  }, [isEditionSpecific, currentEdition, selectedEditionId])

  const openCreate = () => {
    setCertificateHours(0)
    setRequiresAttendance(true)
    setCertificateText("")
    setIsSpeaker(false)
    setEditingId(null)
    setNameEs("")
    setNameEn("")
    setSlug("")
    setBadgeColor("#3b82f6")
    setIsEditionSpecific(false)
    setSelectedEditionId(currentEdition?.id || "")
    setIsActive(true)
    setAutoSlug(true)
    setFormError("")
    setIsSheetOpen(true)
  }

  const openCreateWithSuggestion = (sug: typeof SUGGESTIONS[0]) => {
    setCertificateHours(0)
    setRequiresAttendance(sug.slug === "participant")
    setCertificateText("")
    setIsSpeaker(sug.slug.startsWith("speaker"))
    setEditingId(null)
    setNameEs(sug.nameEs)
    setNameEn(sug.nameEn)
    setSlug(sug.slug)
    setBadgeColor(sug.badgeColor)
    setIsEditionSpecific(false)
    setSelectedEditionId(currentEdition?.id || "")
    setIsActive(true)
    setAutoSlug(false) // already prefilled slug
    setFormError("")
    setIsSheetOpen(true)
  }

  const openEdit = (role: ParticipantRole) => {
    setCertificateHours(role.certificateHours || 0)
    setRequiresAttendance(role.requiresAttendance !== false)
    setCertificateText(role.certificateText || "")
    setIsSpeaker(role.isSpeaker || false)
    setEditingId(role.id)
    setNameEs(role.name.es || "")
    setNameEn(role.name.en || "")
    setSlug(role.slug)
    setBadgeColor(role.badgeColor || "#3b82f6")
    setIsEditionSpecific(!!role.editionId)
    setSelectedEditionId(role.editionId || currentEdition?.id || "")
    setIsActive(role.isActive)
    setAutoSlug(false)
    setFormError("")
    setIsSheetOpen(true)
  }

  const closeSheet = () => {
    setIsSheetOpen(false)
    setEditingId(null)
    setFormError("")
  }

  const handleNameEsChange = (val: string) => {
    setNameEs(val)
    if (autoSlug && !editingId) {
      setSlug(slugify(val))
    }
  }

  const handleSlugChange = (val: string) => {
    setSlug(val)
    setAutoSlug(false)
  }

  const roleFormSchema = z.object({
    nameEs: z.string().trim().min(1, "El nombre en español es obligatorio."),
    nameEn: z.string().trim().optional(),
    slug: z.string().trim().min(1, "El código del rol es obligatorio.").regex(/^[a-z0-9_-]+$/, "El código solo debe contener letras minúsculas, números, guiones o guiones bajos."),
  })

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setFormError("")

    const validation = roleFormSchema.safeParse({
      nameEs,
      nameEn,
      slug,
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0].message)
      return
    }
    if (!Number.isInteger(certificateHours) || certificateHours < 0 || certificateHours > 10000) {
      setFormError("Las horas deben ser un entero entre 0 y 10000.")
      return
    }
    if (isEditionSpecific && !selectedEditionId) {
      setFormError("Selecciona una edición para este rol.")
      return
    }

    const payload = {
      mainEventId: id!,
      editionId: isEditionSpecific ? selectedEditionId : null,
      slug: slug.trim(),
      name: { es: nameEs.trim(), en: nameEn.trim() },
      badgeColor,
      isActive,
      isSpeaker,
      certificateHours,
      requiresAttendance,
      certificateText: certificateText.trim() || null,
    }

    try {
      setSaving(true)
      if (editingId) {
        await updateRole(editingId, payload)
        toast.success("Rol actualizado correctamente")
      } else {
        // Validate if slug already exists in state before sending
        const duplicate = eventRoles.some(
          (r) =>
            r.slug === payload.slug &&
            (payload.editionId
              ? r.editionId === payload.editionId
              : r.editionId === null)
        )
        if (duplicate) {
          setFormError(`Ya existe un rol con el slug "${payload.slug}" para este ámbito.`)
          return
        }
        await addRole(payload)
        toast.success("Rol creado correctamente")
      }
      closeSheet()
    } catch (err: any) {
      console.error(err)
      const message = err?.message || "Ocurrió un error al guardar el rol. Verifica que el slug sea único."
      setFormError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRole = async (roleId: string) => {
    try {
      await deleteRole(roleId)
      toast.success("Rol eliminado con éxito.")
    } catch (error: any) {
      toast.error(error?.message || "No se pudo eliminar el rol.")
    }
  }

  const columns: ColumnDef<any>[] = [
    {
      header: "Nombre",
      className: "p-3",
      headerClassName: "p-3",
      cell: (role) => {
        const bgClr = role.badgeColor || "#6b7280"
        const styleBadge = {
          backgroundColor: `${bgClr}12`,
          color: bgClr,
          borderColor: `${bgClr}30`,
        }
        return (
          <div className="flex items-center gap-2">
            <div
              className="px-2 py-0.5 rounded-md border text-xs font-bold font-sans tracking-wide"
              style={styleBadge}
            >
              {role.name.es}
            </div>
            {role.name.en && (
              <span className="text-xs text-muted-foreground">
                / {role.name.en}
              </span>
            )}
          </div>
        )
      }
    },
    {
      header: "Slug",
      className: "p-3",
      headerClassName: "p-3",
      cell: (role) => (
        <code className="text-xs font-mono bg-muted/30 px-1.5 py-0.5 rounded border border-border/40">
          {role.slug}
        </code>
      )
    },
    {
      header: "Ámbito (Aplicabilidad)",
      className: "p-3 text-xs",
      headerClassName: "p-3",
      cell: (role) => {
        const isGlobal = !role.editionId
        const targetEditionName = isGlobal
          ? ""
          : eventEditions.find((ed) => ed.id === role.editionId)?.name || "Edición Desconocida"
        return isGlobal ? (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            Global (Todas las ediciones)
          </Badge>
        ) : (
          <Badge variant="outline" className="border-primary/20 text-primary">
            Edición: {targetEditionName}
          </Badge>
        )
      }
    },
    {
      header: "Estado",
      className: "p-3 text-xs",
      headerClassName: "p-3",
      cell: (role) => (
        <span className={`inline-flex items-center gap-1.5 font-semibold ${role.isActive ? "text-emerald-500" : "text-muted-foreground"}`}>
          <span className={`size-1.5 rounded-full ${role.isActive ? "bg-emerald-500" : "bg-muted-foreground"}`} />
          {role.isActive ? "Activo" : "Inactivo"}
        </span>
      )
    },
    {
      header: "Acciones",
      headerClassName: "text-right p-3",
      className: "text-right p-3",
      cell: (role) => (
        <div className="flex items-center justify-end gap-1">
          <Button onClick={() => openEdit(role)} variant="ghost" className="size-7 p-0">
            <Edit className="size-3.5" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="size-7 p-0 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar rol de participante?</AlertDialogTitle>
                <AlertDialogDescription>
                  No podrás eliminar este rol si tiene participantes o ponentes asignados. Primero reasigna esos registros a otro rol.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleDeleteRole(role.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Sí, eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )
    }
  ]

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      
      <PageHeader
        title="Roles de Participantes"
        description="Administra los roles personalizados que los participantes pueden tener en este evento."
        actionButton={
          <Button onClick={openCreate} className="text-xs px-3 py-1.5 h-8">
            <Plus className="size-4 mr-1.5" />
            Nuevo Rol
          </Button>
        }
      />

      {/* Suggested Roles Cards Block */}
      {availableSuggestions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Sparkles className="size-4 text-primary" />
            <span>Sugerencias rápidas de roles</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {availableSuggestions.map((sug) => (
              <div
                key={sug.slug}
                className="p-4 rounded-xl border border-border/60 bg-card/40 flex flex-col justify-between space-y-3 hover:border-border transition-all duration-300 relative overflow-hidden group"
              >
                {/* Visual glass color blur */}
                <div
                  className="absolute -right-8 -top-8 size-16 rounded-full blur-xl opacity-10 group-hover:opacity-20 transition-opacity"
                  style={{ backgroundColor: sug.badgeColor }}
                />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{sug.nameEs}</span>
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: sug.badgeColor }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {sug.description}
                  </p>
                </div>

                <Button
                  onClick={() => openCreateWithSuggestion(sug)}
                  variant="outline"
                  className="w-full text-xs h-7 py-1 px-2 border-border/80 hover:bg-muted"
                >
                  Usar sugerencia
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table list of roles */}
      {eventRoles.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl bg-card/20 space-y-3">
          <Shield className="size-8 mx-auto opacity-40" />
          <div>
            <p className="font-semibold">No hay roles personalizados registrados</p>
            <p className="text-xs text-muted-foreground">
              Usa las sugerencias rápidas de arriba o crea un rol desde cero.
            </p>
          </div>
        </div>
      ) : (
        <DataTable columns={columns} data={eventRoles} />
      )}

      {/* Creation/Editing Sheet Form */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editingId ? "Editar Rol" : "Nuevo Rol de Participante"}</SheetTitle>
            <SheetDescription>
              Define el nombre, identificador (slug) y personaliza el aspecto visual del rol.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSave} className="space-y-5 px-4 mt-6 flex-1 overflow-y-auto pb-6">
            
            {formError && (
              <div className="p-3 text-xs bg-destructive/15 text-destructive rounded-lg border border-destructive/20 font-medium">
                {formError}
              </div>
            )}

            <FieldGroup>
              
              {/* Spanish Name */}
              <Field>
                <FieldLabel htmlFor="roleNameEs">Nombre (Español) *</FieldLabel>
                <Input
                  id="roleNameEs"
                  value={nameEs}
                  onChange={(e) => handleNameEsChange(e.target.value)}
                  placeholder="Ej. Ponente Magistral"
                  required
                />
              </Field>

              {/* English Name */}
              <Field>
                <FieldLabel htmlFor="roleNameEn">Nombre (Inglés - Opcional)</FieldLabel>
                <Input
                  id="roleNameEn"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="Ej. Keynote Speaker"
                />
              </Field>

              {/* Slug */}
              <Field>
                <FieldLabel htmlFor="roleSlug">Código del rol *</FieldLabel>
                <Input
                  id="roleSlug"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="speaker_mg"
                  required
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Define un código único: asistente, organizador, comite_cientifico, moderador o cualquier otro rol.
                </p>
              </Field>

              <Field orientation="horizontal">
                <Switch id="speakerRole" checked={isSpeaker} onCheckedChange={setIsSpeaker} />
                <FieldLabel htmlFor="speakerRole">Este rol participa como expositor en la agenda</FieldLabel>
              </Field>
              <Field>
                <FieldLabel htmlFor="certificateHours">Horas académicas del certificado</FieldLabel>
                <Input id="certificateHours" type="number" min={0} max={10000} step={1} value={certificateHours} onChange={(event) => setCertificateHours(Number(event.target.value))} />
              </Field>
              <Field orientation="horizontal">
                <Switch id="requiresAttendance" checked={requiresAttendance} onCheckedChange={setRequiresAttendance} />
                <FieldLabel htmlFor="requiresAttendance">Requiere asistencia válida para certificar</FieldLabel>
              </Field>
              <Field>
                <FieldLabel htmlFor="certificateText">Texto de participación</FieldLabel>
                <Input id="certificateText" maxLength={2000} value={certificateText} onChange={(event) => setCertificateText(event.target.value)} placeholder="Por su participación como integrante del comité científico" />
              </Field>

              {/* Badge Color Customization */}
              <Field>
                <FieldLabel>Color de Distintivo (Badge)</FieldLabel>
                <div className="space-y-3">
                  {/* Preset color bubbles */}
                  <div className="flex items-center gap-2">
                    {PRESETS_COLORS.map((clr) => (
                      <button
                        key={clr.hex}
                        type="button"
                        onClick={() => setBadgeColor(clr.hex)}
                        className={`size-6 rounded-full border transition-all relative ${
                          badgeColor === clr.hex
                            ? "border-primary scale-110 shadow-sm"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: clr.hex }}
                        title={clr.name}
                      >
                        {badgeColor === clr.hex && (
                          <span className="absolute inset-0 flex items-center justify-center text-white">
                            <Check className="size-3" />
                          </span>
                        )}
                      </button>
                    ))}
                    
                    {/* Custom picker */}
                    <div className="flex items-center gap-2 ml-1">
                      <input
                        type="color"
                        value={badgeColor}
                        onChange={(e) => setBadgeColor(e.target.value)}
                        className="w-7 h-7 rounded-md border border-border cursor-pointer bg-transparent"
                      />
                      <span className="text-xs font-mono font-medium text-muted-foreground uppercase">
                        {badgeColor}
                      </span>
                    </div>
                  </div>
                </div>
              </Field>

              {/* Scope Switch (Global vs Edition) */}
              <div className="bg-muted/10 border border-border/60 p-4 rounded-xl space-y-4 mt-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <label className="text-sm font-semibold cursor-pointer select-none" htmlFor="editionSpecificSwitch">
                      ¿Este rol aplica solo para la edición actual?
                    </label>
                    <p className="text-xs text-muted-foreground leading-normal">
                      Si se activa, el rol existirá únicamente para la edición elegida. Desactivado será global y servirá para futuras ediciones.
                    </p>
                  </div>
                  <Switch
                    id="editionSpecificSwitch"
                    checked={isEditionSpecific}
                    onCheckedChange={setIsEditionSpecific}
                  />
                </div>

                {/* Dropdown with event editions - visible only if switch is ON */}
                {isEditionSpecific && (
                  <Field className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <FieldLabel htmlFor="editionSelect">Seleccionar Edición</FieldLabel>
                    {eventEditions.length === 0 ? (
                      <p className="text-xs text-amber-500 font-medium">
                        No hay ediciones creadas. Crea una edición primero.
                      </p>
                    ) : (
                      <Select value={selectedEditionId} onValueChange={setSelectedEditionId}>
                        <SelectTrigger id="editionSelect">
                          <SelectValue placeholder="Selecciona una edición" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                          {eventEditions.map((ed) => (
                            <SelectItem key={ed.id} value={ed.id}>
                              {ed.name} ({ed.year}) {ed.isCurrent ? "— [Actual]" : ""}
                            </SelectItem>
                          ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                )}
              </div>

              {/* Status Switch (Active / Inactive) */}
              <div className="flex items-center justify-between p-1">
                <div className="space-y-0.5">
                  <label className="text-sm font-semibold cursor-pointer select-none" htmlFor="activeSwitch">
                    Rol activo
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Los roles inactivos no se pueden asignar a nuevos participantes.
                  </p>
                </div>
                <Switch
                  id="activeSwitch"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>

            </FieldGroup>
          </form>

          <SheetFooter className="mt-8 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={closeSheet}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="font-semibold">
              {saving ? "Guardando…" : editingId ? "Guardar Cambios" : "Crear Rol"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
