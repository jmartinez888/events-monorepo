import React, { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { z } from "zod"
import { useEventStore } from "@/store/event.store"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormFooter } from "@/components/form-footer"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select"
import { AlertTriangle, Trash2, Plus, Loader2, Edit, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { MediaUploader } from "@/components/MediaUploader"
import { useSEO } from "@/hooks/use-seo"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { api } from "@/api/client"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { toast } from "sonner"

export function EditSpeakerPage() {
  const { eventId, speakerId } = useParams<{ eventId: string; speakerId: string }>()
  const navigate = useNavigate()

  const { speakers, roles, editions, thematicLines, events, loadRoles, loadThematicLines, updateSpeaker } = useEventStore()
  const [isLoadingSession, setIsLoadingSession] = useState(false)
  const [remoteEditions, setRemoteEditions] = useState<any[]>([])

  const eventEditions = remoteEditions.length ? remoteEditions : editions.filter((ed) => ed.mainEventId === eventId)
  const currentEdition = eventEditions.find((ed) => ed.isCurrent)

  const [remoteSpeaker, setRemoteSpeaker] = useState<any | null>(null)
  const localSpeaker = speakers.find((s) => s.id === speakerId)
  const speaker = remoteSpeaker || localSpeaker
  const event = events.find((item) => item.id === eventId)

  useSEO({
    title: speaker ? `Editar Ponente: ${speaker.firstName} ${speaker.lastName}` : "Editar Ponente",
    description: "Modifica los datos personales del ponente, su biografía, fotografía y los detalles de su ponencia."
  })

  // Form states
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [bio, setBio] = useState("")
  const [avatar, setAvatar] = useState("")
  const [institution, setInstitution] = useState("")
  const [selectedRoleId, setSelectedRoleId] = useState("")
  const [selectedEditionId, setSelectedEditionId] = useState("")

  // Navigation and Search states
  const [allEventSpeakers, setAllEventSpeakers] = useState<Array<{ id: string, name: string }>>([])
  const [searchVal, setSearchVal] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Filter local speakers
  const suggestedSpeakers = searchVal.trim()
    ? allEventSpeakers.filter(s => s.name.toLowerCase().includes(searchVal.toLowerCase()))
    : []

  // Close suggestions on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const currentIndex = allEventSpeakers.findIndex(s => s.id === speakerId)

  // Load all speakers for navigation
  useEffect(() => {
    async function loadAllSpeakers() {
      if (!eventId) return
      try {
        const data = await api.content.speakers(eventId)
        const current = (data || []).find((part: any) => part.id === speakerId)
        const direct = current || await api.participants.get(speakerId!).catch(() => null)
        if (direct) setRemoteSpeaker({
          ...direct,
          firstName: direct.profile?.firstName || "",
          lastName: direct.profile?.lastName || "",
          bio: direct.profile?.bio || "",
          avatar: direct.profile?.avatarUrl || "",
          institution: direct.profile?.institution || "",
          profileId: direct.profileId,
          editionId: direct.editionId || direct.edition_id || direct.edition?.id || "",
          roleId: direct.roleId || direct.role_id || "",
        })
        setAllEventSpeakers((data || []).map((part: any) => ({
          id: part.id,
          name: `${part.profile?.firstName || ""} ${part.profile?.lastName || ""}`.trim() || "Ponente",
        })))
      } catch (err) {
        console.error("Error loading all speakers for navigation:", err)
      }
    }
    loadAllSpeakers()
  }, [eventId, speakerId])

  // Sessions List State
  const [sessionsList, setSessionsList] = useState<Array<{
    id: string
    title: string
    thematicLines: string[]
    resources: Array<{ id: string; name: string; file_url: string }>
  }>>([])

  // Modal / Dialog States
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<any | null>(null)
  const [isSavingModal, setIsSavingModal] = useState(false)
  const [modalError, setModalError] = useState("")
  const [tempSessionTitle, setTempSessionTitle] = useState("")
  const [tempSelectedThematicLines, setTempSelectedThematicLines] = useState<string[]>([])
  const [tempSessionResources, setTempSessionResources] = useState<Array<{ name: string; file_url: string }>>([])

  // Alert Dialog State for Deleting
  const [sessionToDelete, setSessionToDelete] = useState<any | null>(null)
  const [isDeletingSession, setIsDeletingSession] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  // Load roles and thematic lines for list
  useEffect(() => {
    if (eventId) {
      loadRoles(eventId)
      loadThematicLines(eventId)
      api.editions.list(eventId).then((rows) => setRemoteEditions((rows || []).map((row: any) => ({ ...row, startDate: row.startDate || "", endDate: row.endDate || "", year: row.startDate ? new Date(row.startDate).getFullYear() : "Sin fecha" })))).catch(() => setRemoteEditions([]))
    }
  }, [eventId, loadRoles, loadThematicLines])

  // Pre-fill form fields when speaker data is available
  useEffect(() => {
    if (speaker) {
      setEmail(speaker.email || "")
      setFirstName(speaker.firstName || "")
      setLastName(speaker.lastName || "")
      setBio(speaker.bio || "")
      setAvatar(speaker.avatar || "")
      setInstitution(speaker.institution || "")
      setSelectedRoleId(speaker.roleId || "")
      setSelectedEditionId(speaker.editionId || currentEdition?.id || "")
    }
  }, [speaker, currentEdition])

  // Load session details for the speaker
  useEffect(() => {
    async function fetchSessionsInfo() {
      if (!speakerId) return
      setIsLoadingSession(true)
      try {
        const sessionsData = await api.content.participantSessions(speakerId)
        const loadedSessions = await Promise.all((sessionsData || []).map(async (sess: any) => {
          const [thematicData, resourceData] = await Promise.all([
            api.content.sessionLines(sess.id),
            api.content.resources(sess.id),
          ])
          return {
            id: sess.id,
            title: sess.title || "",
            thematicLines: (thematicData || []).map((d: any) => d.thematicLineId || d.thematic_line_id),
            resources: resourceData || [],
          }
        }))
        setSessionsList(loadedSessions)
      } catch (err) {
        console.error("Error loading speaker sessions info:", err)
      } finally {
        setIsLoadingSession(false)
      }
    }

    if (speaker) {
      fetchSessionsInfo()
    }
  }, [speaker, speakerId])

  // Sync temporary states when modal opens/changes
  useEffect(() => {
    if (isModalOpen) {
      if (editingSession) {
        setTempSessionTitle(editingSession.title)
        setTempSelectedThematicLines(editingSession.thematicLines)
        setTempSessionResources(editingSession.resources.map((r: any) => ({ name: r.name, file_url: r.file_url })))
      } else {
        setTempSessionTitle("")
        setTempSelectedThematicLines([])
        setTempSessionResources([])
      }
      setModalError("")
    }
  }, [isModalOpen, editingSession])

  const handleSaveSession = async () => {
    setModalError("")
    if (!tempSessionTitle.trim()) {
      setModalError("El título de la charla es obligatorio.")
      return
    }

    setIsSavingModal(true)
    try {
      if (editingSession) {
        // A. Update existing session
        const sId = editingSession.id

        // 1. Update session title
        await api.content.updateSession(sId, { title: tempSessionTitle.trim() })

        // 2. Sync thematic lines
        const existingLines = await api.content.sessionLines(sId)
        await Promise.all((existingLines || []).map((line: any) => api.content.removeSessionLine(sId, line.thematicLineId || line.thematic_line_id)))

        if (tempSelectedThematicLines.length > 0) {
          await Promise.all(tempSelectedThematicLines.map((lineId) => api.content.addSessionLine(sId, lineId)))
        }

        // 3. Sync resources
        const existingResources = await api.content.resources(sId)
        await Promise.all((existingResources || []).map((resource: any) => api.content.removeResource(resource.id)))

        if (tempSessionResources.length > 0) {
          await Promise.all(tempSessionResources.filter((r) => r.name.trim() && r.file_url.trim()).map((r) => api.content.addResource(sId, { name: r.name.trim(), url: r.file_url.trim(), type: r.file_url.split('.').pop() || 'application/octet-stream' })))
        }

        // Fetch fresh resources with IDs from DB to avoid state sync issues
        const freshResources = await api.content.resources(sId)

        // Update local state list
        setSessionsList(sessionsList.map((s) => s.id === sId ? {
          id: sId,
          title: tempSessionTitle.trim(),
          thematicLines: tempSelectedThematicLines,
          resources: freshResources || []
        } : s))
      } else {
        // B. Creating a new session during edit
        const newSessionId = crypto.randomUUID()

        // 1. Insert event_sessions
        const createdSession = await api.content.createSessionForEdition(selectedEditionId || currentEdition?.id || eventId!, { title: tempSessionTitle.trim() })
        const createdSessionId = createdSession.id || newSessionId

        // 2. Insert session_speakers
        const participant = await api.participants.get(speakerId!)
        await api.content.addSpeaker(createdSessionId, participant.profileId)

        // 3. Insert session_thematic_lines
        if (tempSelectedThematicLines.length > 0) {
          await Promise.all(tempSelectedThematicLines.map((lineId) => api.content.addSessionLine(createdSessionId, lineId)))
        }

        // 4. Insert session_resources
        if (tempSessionResources.length > 0) {
          await Promise.all(tempSessionResources.filter((r) => r.name.trim() && r.file_url.trim()).map((r) => api.content.addResource(createdSessionId, { name: r.name.trim(), url: r.file_url.trim(), type: r.file_url.split('.').pop() || 'application/octet-stream' })))
        }

        // Fetch fresh resources with IDs
        const freshResources = await api.content.resources(createdSessionId)

        // Update local state list
        const newSession = {
          id: createdSessionId,
          title: tempSessionTitle.trim(),
          thematicLines: tempSelectedThematicLines,
          resources: freshResources || []
        }
        setSessionsList([...sessionsList, newSession])
      }

      setIsModalOpen(false)
      setEditingSession(null)
    } catch (err: any) {
      console.error(err)
      setModalError(err?.message || "Ocurrió un error al guardar la sesión.")
    } finally {
      setIsSavingModal(false)
    }
  }

  const handleConfirmDeleteSession = async () => {
    if (!sessionToDelete) return
    setIsDeletingSession(true)
    try {
      await api.content.removeSession(sessionToDelete.id)

      // Remove from local state list
      setSessionsList(sessionsList.filter((s) => s.id !== sessionToDelete.id))
      setSessionToDelete(null)
    } catch (err: any) {
      console.error("Error deleting session:", err)
      alert(err?.message || "Ocurrió un error al eliminar la sesión.")
    } finally {
      setIsDeletingSession(false)
    }
  }

  // Get active roles of this event
  const activeRoles = roles.filter((r) => r.mainEventId === eventId && r.isActive && r.isSpeaker && (!r.editionId || r.editionId === selectedEditionId))

  // Find speaker and keynote-speaker roles

  const speakerEditFormSchema = z.object({
    firstName: z.string().trim().min(1, "El nombre es obligatorio."),
    lastName: z.string().trim().min(1, "El apellido es obligatorio."),
    bio: z.string().trim().min(1, "La biografía del ponente es obligatoria."),
    selectedRoleId: z.string().min(1, "Debes seleccionar un rol para el ponente."),
    selectedEditionId: z.string().min(1, "Por favor, selecciona una edición."),
  })

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError("")

    const result = speakerEditFormSchema.safeParse({
      firstName,
      lastName,
      bio,
      selectedRoleId,
      selectedEditionId,
    })

    if (!result.success) {
      setFormError(result.error.issues[0].message)
      return
    }

    setIsSubmitting(true)

    const payload = {
      editionId: selectedEditionId,
      roleId: selectedRoleId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      avatar: avatar.trim() || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(firstName + " " + lastName)}`,
      talkTitle: sessionsList[0]?.title || "",
      talkDescription: "",
      bio: bio.trim(),
      institution: institution.trim() || null,
    }

    try {
      await updateSpeaker(speakerId!, payload)
      navigate(`/dashboard/events/${eventId}/speakers`)
    } catch (err: any) {
      console.error(err)
      setFormError(err?.message || "Ocurrió un error al actualizar el ponente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!speaker) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-center items-center gap-4 text-center">
        <AlertTriangle className="size-12 text-destructive animate-bounce" />
        <h3 className="font-bold text-lg">Participante no encontrado</h3>
        <p className="text-sm text-muted-foreground">El participante seleccionado no existe o no pertenece a este evento.</p>
        <Button onClick={() => navigate(`/dashboard/events/${eventId}/speakers`)} variant="outline">
          Volver a Ponentes
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      <main className="max-w-4xl mx-auto px-6 py-12 flex-1 w-full pb-28">
        <div className="mb-10">
          <PageHeader
            title="Editar Ponente"
            description={`Modifica los datos del perfil y la ponencia de: ${speaker.name}.`}
            showBackButton
            onBackClick={() => navigate(`/dashboard/events/${eventId}/speakers`)}
            actionButton={
              <div className="flex items-center gap-4 flex-wrap">
                {/* Search Bar */}
                <div ref={suggestionsRef} className="relative w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar ponente..."
                    value={searchVal}
                    onChange={(e) => {
                      setSearchVal(e.target.value)
                      setShowSuggestions(true)
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="pl-9 h-9 text-xs rounded-xl"
                  />
                  {showSuggestions && suggestedSpeakers.length > 0 && (
                    <div className="absolute right-0 left-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto py-1">
                      {suggestedSpeakers.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            navigate(`/dashboard/events/${eventId}/speakers/${s.id}/edit`)
                            setSearchVal("")
                            setShowSuggestions(false)
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors text-foreground font-medium truncate"
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Minimalist Prev/Next Navigation Controls */}
                <div className="flex items-center gap-1 bg-muted/40 p-1 border border-border rounded-xl">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (currentIndex > 0) {
                        const prevSpeaker = allEventSpeakers[currentIndex - 1]
                        navigate(`/dashboard/events/${eventId}/speakers/${prevSpeaker.id}/edit`)
                      }
                    }}
                    disabled={currentIndex <= 0}
                    className="size-7 p-0 rounded-lg hover:bg-background"
                    title="Ponente anterior"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-[10px] font-bold text-muted-foreground px-1.5 select-none uppercase">
                    {currentIndex + 1} / {allEventSpeakers.length}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (currentIndex < allEventSpeakers.length - 1) {
                        const nextSpeaker = allEventSpeakers[currentIndex + 1]
                        navigate(`/dashboard/events/${eventId}/speakers/${nextSpeaker.id}/edit`)
                      }
                    }}
                    disabled={currentIndex < 0 || currentIndex >= allEventSpeakers.length - 1}
                    className="size-7 p-0 rounded-lg hover:bg-background"
                    title="Siguiente ponente"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            }
          />
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {formError && (
            <div className="p-4 text-sm bg-destructive/15 text-destructive rounded-xl border border-destructive/20 font-medium">
              {formError}
            </div>
          )}

          <h2 className="text-lg">Información de Perfil</h2>
          {/* Card: Perfil del Ponente */}
          <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
            {/* Email Row */}
            <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
              <div className="md:w-1/3 space-y-1">
                <label htmlFor="emailInput" className="text-sm font-medium text-foreground">Correo Electrónico (No editable)</label>
                <p className="text-xs text-muted-foreground">Identifica la cuenta del usuario.</p>
              </div>
              <div className="md:w-2/3 max-w-md w-full">
                <Input
                  id="emailInput"
                  type="email"
                  value={email}
                  disabled
                  className="bg-muted/40 cursor-not-allowed opacity-80"
                />
              </div>
            </div>

            {/* Names Row */}
            <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
              <div className="md:w-1/3 space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Nombre Completo <span className="text-destructive">*</span>
                </label>
                <p className="text-xs text-muted-foreground">Nombre y apellido del ponente.</p>
              </div>
              <div className="md:w-2/3 max-w-md w-full">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstNameInput" className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">Nombre</label>
                    <Input
                      id="firstNameInput"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Ej. Carlos"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label htmlFor="lastNameInput" className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">Apellido</label>
                    <Input
                      id="lastNameInput"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Ej. Mendoza"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Institution Row */}
            <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
              <div className="md:w-1/3 space-y-1">
                <label htmlFor="institutionInput" className="text-sm font-medium text-foreground">
                  Institución
                </label>
                <p className="text-xs text-muted-foreground">Empresa, universidad o centro de afiliación del ponente.</p>
              </div>
              <div className="md:w-2/3 max-w-md w-full">
                <Input
                  id="institutionInput"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="Ej. Universidad Nacional"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Avatar Row */}
            <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
              <div className="md:w-1/3 space-y-1">
                <label className="text-sm font-medium text-foreground">Foto de Perfil</label>
                <p className="text-xs text-muted-foreground">Sube una foto de avatar para el ponente o introduce un enlace directo.</p>
              </div>
              <div className="md:w-2/3 max-w-md w-full">
                <MediaUploader
                  value={avatar}
                  onChange={async (newUrl) => {
                    setAvatar(newUrl)
                    if (speakerId) {
                      try {
                        await updateSpeaker(speakerId, { avatar: newUrl || "" })
                        toast.success("Foto del ponente actualizada en la base de datos")
                      } catch (err: any) {
                        console.error("Failed to auto-update speaker avatar in DB:", err)
                        toast.error("No se pudo actualizar la foto en la base de datos.")
                      }
                    }
                  }}
                  variant="avatar"
                  ownerType="PROFILE"
                  ownerId={speaker?.profileId || speaker?.profile?.id || ""}
                  organizationId={event?.organizationId || ""}
                  purpose="OTHER"
                  assetTarget={event?.organizationId && (speaker?.profileId || speaker?.profile?.id) ? {
                    organizationId: event.organizationId,
                    type: "profiles/avatar",
                    resourceId: speaker.profileId || speaker.profile.id,
                  } : undefined}
                  folder={`events/${eventId}/speakers`}
                  identifier="avatar"
                />
              </div>
            </div>

            {/* Bio Row */}
            <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4">
              <div className="md:w-1/3 space-y-1">
                <label htmlFor="bioInput" className="text-sm font-medium text-foreground">
                  Biografía del Ponente <span className="text-destructive">*</span>
                </label>
                <p className="text-xs text-muted-foreground">Breve descripción profesional del expositor.</p>
              </div>
              <div className="md:w-2/3 max-w-md w-full">
                <textarea
                  id="bioInput"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Escribe una breve descripción del perfil profesional del ponente..."
                  required
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          <h2 className="text-lg">Rol y Ámbito</h2>
          {/* Card: Detalles de Rol y Ámbito */}
          <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
            {/* Role Select Row */}
            <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
              <div className="md:w-1/3 space-y-1">
                <label htmlFor="roleSelect" className="text-sm font-medium text-foreground">
                  Tipo de Ponente <span className="text-destructive">*</span>
                </label>
                <p className="text-xs text-muted-foreground">Selecciona el tipo de ponente para este evento.</p>
              </div>
              <div className="md:w-2/3 max-w-md w-full">
                {activeRoles.length === 0 ? (
                  <p className="text-xs text-amber-500 font-medium">
                    No hay roles activos en el evento. Crea un rol primero en la sección de Roles.
                  </p>
                ) : (
                  <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                    <SelectTrigger id="roleSelect">
                      <SelectValue placeholder="Selecciona un rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                      {activeRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name.es}
                        </SelectItem>
                      ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Scope Row */}
            <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4">
              <div className="md:w-1/3 space-y-1">
                <label className="text-sm font-medium text-foreground">Edición *</label>
                <p className="text-xs text-muted-foreground">Selecciona la edición del evento a la que pertenece el ponente.</p>
              </div>
              <div className="md:w-2/3 max-w-md w-full">
                {eventEditions.length === 0 ? (
                  <p className="text-xs text-amber-500 font-medium">
                    No hay ediciones creadas para este evento.
                  </p>
                ) : (
                  <Select value={selectedEditionId} onValueChange={setSelectedEditionId}>
                    <SelectTrigger id="speakerEditionSelect">
                      <SelectValue placeholder="Selecciona una edición" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventEditions.map((ed) => (
                        <SelectItem key={ed.id} value={ed.id}>
                          {`${ed.name} (${ed.year}) ${ed.isCurrent ? "— [Actual]" : ""}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          <h2 className="text-lg">Tema(s) de Ponencia</h2>
          {/* Card: Temas de Ponencia */}
          <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 gap-4 border-b border-border">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-foreground">Acceso a Temas de Ponencia</h3>
                <p className="text-xs text-muted-foreground">
                  Administra las charlas magistrales, las líneas temáticas asociadas y el material de descarga del ponente.
                </p>
              </div>
              <div>
                <Button
                  type="button"
                  onClick={() => {
                    setEditingSession(null)
                    setIsModalOpen(true)
                  }}
                  variant="outline"
                  className="cursor-pointer text-xs h-9"
                >
                  <Plus className="size-3.5 mr-1" />
                  Asociar tema
                </Button>
              </div>
            </div>

            <div className="p-6 bg-card divide-y divide-border/60">
              {isLoadingSession ? (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Cargando detalles de los temas...</span>
                </div>
              ) : sessionsList.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  Este ponente no tiene ningún tema de ponencia o sesión asociada actualmente en este evento.
                </p>
              ) : (
                sessionsList.map((sess, idx) => (
                  <div key={sess.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      {/* Title */}
                      <div className="space-y-1 flex-1">
                        <span className="text-[9px] font-bold uppercase text-muted-foreground block">Charla / Sesión #{idx + 1}</span>
                        <p className="text-sm font-semibold text-foreground leading-snug">{sess.title}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditingSession(sess)
                            setIsModalOpen(true)
                          }}
                          className="size-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Editar sesión"
                        >
                          <Edit className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setSessionToDelete(sess)}
                          className="size-8 p-0 text-destructive hover:bg-destructive/10"
                          title="Eliminar sesión"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Lines */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground block">Líneas Temáticas</span>
                        {sess.thematicLines.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic text-[11px]">Ninguna seleccionada</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {sess.thematicLines.map((lineId) => {
                              const line = thematicLines.find((tl) => tl.id === lineId)
                              if (!line) return null
                              return (
                                <Badge
                                  key={lineId}
                                  variant="outline"
                                  className="text-[9px] font-semibold px-2 py-0.5"
                                  style={{
                                    backgroundColor: `${line.colorHex || '#3b82f6'}15`,
                                    color: line.colorHex || '#3b82f6',
                                    borderColor: `${line.colorHex || '#3b82f6'}30`
                                  }}
                                >
                                  {line.name}
                                </Badge>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Resources list */}
                      {sess.resources.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground block">Material Descargable</span>
                          <div className="flex flex-col gap-1">
                            {sess.resources.map((res) => (
                              <a
                                key={res.id}
                                href={res.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline truncate"
                              >
                                <span className="size-1.5 bg-emerald-500 rounded-full shrink-0" />
                                <span className="truncate">{res.name}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <FormFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/dashboard/events/${eventId}/speakers`)}
              disabled={isSubmitting}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="cursor-pointer font-semibold px-6"
            >
              Guardar Cambios
            </Button>
          </FormFooter>
        </form>
      </main>

      <Dialog open={isModalOpen} onOpenChange={(open) => {
        setIsModalOpen(open)
        if (!open) setEditingSession(null)
      }}>
        <DialogContent className="max-w-xl sm:rounded-xl">
          <DialogHeader>
            <DialogTitle>{editingSession ? "Editar Tema de Ponencia" : "Asociar Tema de Ponencia"}</DialogTitle>
            <DialogDescription>
              {editingSession
                ? "Modifica el título de la charla, las líneas temáticas asociadas y los recursos disponibles."
                : "Crea una nueva sesión para este ponente en la edición actual."}
            </DialogDescription>
          </DialogHeader>

          {modalError && (
            <div className="p-3 text-xs bg-destructive/15 text-destructive rounded-xl border border-destructive/20 font-medium">
              {modalError}
            </div>
          )}

          <div className="space-y-5 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="modalSessionTitleInput" className="text-xs font-bold uppercase text-muted-foreground">
                Título de la Charla / Sesión <span className="text-destructive">*</span>
              </Label>
              <Input
                id="modalSessionTitleInput"
                value={tempSessionTitle}
                onChange={(e) => setTempSessionTitle(e.target.value)}
                placeholder="Ej. Avances en Monitoreo Acústico"
                disabled={isSavingModal}
              />
            </div>

            {/* Thematic Lines */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase text-muted-foreground block">Líneas Temáticas</span>
              {thematicLines.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No hay líneas temáticas creadas para este evento.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {thematicLines.map((line) => {
                    const isChecked = tempSelectedThematicLines.includes(line.id)
                    return (
                      <label
                        key={line.id}
                        className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card hover:bg-muted/40 cursor-pointer transition-colors text-xs font-medium"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setTempSelectedThematicLines(tempSelectedThematicLines.filter((id) => id !== line.id))
                            } else {
                              setTempSelectedThematicLines([...tempSelectedThematicLines, line.id])
                            }
                          }}
                          className="rounded border-input text-primary focus:ring-primary/20 size-4 cursor-pointer"
                          disabled={isSavingModal}
                        />
                        <span className="flex items-center gap-1.5 min-w-0">
                          {line.colorHex && (
                            <span
                              className="size-2 rounded-full shrink-0"
                              style={{ backgroundColor: line.colorHex }}
                            />
                          )}
                          <span className="truncate">{line.name}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Resources */}
            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted-foreground">Recursos Descargables</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTempSessionResources([...tempSessionResources, { name: "", file_url: "" }])}
                  className="text-[10px] h-7 px-2 cursor-pointer"
                  disabled={isSavingModal}
                >
                  <Plus className="size-3 mr-1" />
                  Añadir Recurso
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {tempSessionResources.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic py-1">No hay recursos añadidos.</p>
                ) : (
                  tempSessionResources.map((res, index) => (
                    <div key={index} className="flex gap-2 items-center bg-muted/30 p-2.5 rounded-lg border border-border animate-in fade-in duration-200">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <Input
                          value={res.name}
                          onChange={(e) => {
                            const updated = [...tempSessionResources]
                            updated[index].name = e.target.value
                            setTempSessionResources(updated)
                          }}
                          placeholder="Nombre (ej. Slides)"
                          className="h-8 text-xs"
                          required
                          disabled={isSavingModal}
                        />
                        <Input
                          type="url"
                          value={res.file_url}
                          onChange={(e) => {
                            const updated = [...tempSessionResources]
                            updated[index].file_url = e.target.value
                            setTempSessionResources(updated)
                          }}
                          placeholder="URL del archivo"
                          className="h-8 text-xs"
                          required
                          disabled={isSavingModal}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setTempSessionResources(tempSessionResources.filter((_, idx) => idx !== index))
                        }}
                        className="size-8 p-0 text-destructive hover:bg-destructive/10 shrink-0"
                        disabled={isSavingModal}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsModalOpen(false)
                setEditingSession(null)
              }}
              disabled={isSavingModal}
              className="cursor-pointer text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveSession}
              disabled={isSavingModal}
              className="cursor-pointer font-semibold text-xs px-4"
            >
              {isSavingModal ? "Guardando..." : editingSession ? "Guardar Cambios" : "Crear y Asociar Tema"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog for Confirming Session Deletion */}
      <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => {
        if (!open) setSessionToDelete(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tema de ponencia?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar la sesión "{sessionToDelete?.title}"? Se borrarán permanentemente sus recursos y líneas temáticas vinculadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingSession}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteSession}
              disabled={isDeletingSession}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {isDeletingSession ? "Eliminando..." : "Sí, eliminar tema"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
