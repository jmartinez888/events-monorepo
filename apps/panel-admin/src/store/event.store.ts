import { create } from "zustand"
import { useAuthStore } from "./auth.store"
import { api } from "@/api/client"

export interface Event {
  id: string
  organizationId: string
  ownerId: string
  slug: string
  name: string
  shortDescription: string
  about: any
  logoUrl: string
  coverUrl: string
  brandColors: { primary: string; secondary: string }
  status: "draft" | "published" | "archived"
  isActive: boolean
  websiteUrl: string
  contactEmail: string
  whatsappCommunityUrl?: string
  eventMode?: string
  venueAddress?: string
  latitude?: number | string
  longitude?: number | string
  socialLinks: { twitter: string; facebook: string; linkedin: string; instagram: string }
  settings: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface Edition {
  id: string
  mainEventId: string
  slug: string
  year: number
  name: string
  description: string
  coverUrl: string
  metaThumbnailUrl?: string
  startDate: string
  endDate: string
  isCurrent: boolean
  location: string
  modality: string
  latitude?: number | null
  longitude?: number | null
}

export interface Speaker {
  id: string
  eventId: string
  editionId: string
  profileId: string
  roleId: string
  roleSlug: string
  firstName: string
  lastName: string
  name: string
  email: string | null
  avatar: string
  talkTitle: string
  talkDescription: string
  bio: string
  checkedIn?: boolean
  identityDocumentType?: string | null
  identityDocumentNumber?: string | null
  institution?: string | null
}

export interface AgendaItem {
  id: string
  /** Corresponds to event_id in DB (stores the edition id when linked to an edition) */
  eventId: string
  /** edition_id FK — direct reference to the editions table */
  editionId?: string | null
  /** parent_activity_id FK — for nested/child activities */
  parentActivityId?: string | null
  timeSlot: string
  title: string
  stage: string | null
  speakerId: string
  description?: string | null
  startTime?: string | null
  endTime?: string | null
  duration?: number | null
  meetingUrl?: string | null
  activityMode?: "PRESENCIAL" | "VIRTUAL" | "HIBRIDO"
  status?: "PUBLIC" | "DRAFT" | "ARCHIVED"
  orderIndex?: number
  startDate?: string | null
  endDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface Attendee {
  id: string
  eventId: string
  editionId: string | null
  profileId?: string | null
  fullName: string
  email: string
  ticketType: string
  registrationDate: string
  checkedIn: boolean
  avatarUrl?: string | null
  identityDocumentType?: string | null
  identityDocumentNumber?: string | null
  roleId?: string
  source?: "PARTICIPANT" | "FORM"
  sourceFormTitle?: string
  sourceFormPurpose?: string
  sourceFormId?: string
  submissionId?: string
  answers?: Record<string, unknown>
  formFields?: Array<{ key: string; label: string }>
}

export interface ParticipantRole {
  id: string
  mainEventId: string
  editionId: string | null
  slug: string
  name: Record<string, string> // e.g. { es: string, en?: string }
  badgeColor: string | null
  isActive: boolean
  createdAt: string
  isSpeaker?: boolean
  certificateHours?: number
  requiresAttendance?: boolean
  certificateText?: string | null
  externalTemplateId?: string | null
}

export interface ThematicLine {
  id: string
  mainEventId: string
  editionId: string | null
  name: string
  description: string | null
  iconUrl: string | null
  colorHex: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface EventTicket {
  id: string
  mainEventId: string
  editionId: string | null
  name: string
  description: string | null
  price: number
  currency: string
  quantityTotal: number
  quantitySold: number
  maxPerUser: number | null
  salesStartAt: string | null
  salesEndAt: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AddSpeakerInput {
  eventId: string
  editionId: string
  profileId: string | null
  roleId: string
  firstName: string
  lastName: string
  email: string | null
  avatar: string
  talkTitle: string
  talkDescription: string
  bio: string
  avatarFile?: File | null
  identityDocumentType?: string | null
  identityDocumentNumber?: string | null
  institution?: string | null
}

export interface EventFilters {
  search?: string
  status?: string
  hasEditions?: string
}

interface EventState {
  events: Event[]
  editions: Edition[]
  speakers: Speaker[]
  speakersTotalCount: number
  agendaItems: AgendaItem[]
  attendees: Attendee[]
  roles: ParticipantRole[]
  thematicLines: ThematicLine[]
  tickets: EventTicket[]
  isLoading: boolean

  loadData: (organizationId: string, filters?: EventFilters) => Promise<void>
  loadEditions: (mainEventId: string) => Promise<void>
  loadRoles: (mainEventId: string) => Promise<void>
  loadFilteredSpeakers: (eventId: string, filters?: { search?: string; editionId?: string; page?: number; pageSize?: number; order?: { field: "name" | "created_at"; direction: "asc" | "desc" } }) => Promise<void>
  fetchAllSpeakersForExport: (eventId: string, filters?: { search?: string; editionId?: string }) => Promise<Speaker[]>
  addRole: (role: Omit<ParticipantRole, "id" | "createdAt">) => Promise<void>
  updateRole: (id: string, updates: Partial<Omit<ParticipantRole, "id" | "createdAt">>) => Promise<void>
  deleteRole: (id: string) => Promise<void>

  loadThematicLines: (mainEventId: string) => Promise<void>
  addThematicLine: (thematicLine: Omit<ThematicLine, "id" | "createdAt" | "updatedAt">) => Promise<void>
  updateThematicLine: (id: string, updates: Partial<Omit<ThematicLine, "id" | "createdAt" | "updatedAt">>) => Promise<void>
  deleteThematicLine: (id: string) => Promise<void>

  loadTickets: (mainEventId: string) => Promise<void>
  addTicket: (ticket: Omit<EventTicket, "id" | "quantitySold" | "createdAt" | "updatedAt">) => Promise<void>
  updateTicket: (id: string, updates: Partial<Omit<EventTicket, "id" | "quantitySold" | "createdAt" | "updatedAt">>) => Promise<void>
  deleteTicket: (id: string) => Promise<void>

  addEvent: (event: Omit<Event, "id" | "createdAt" | "updatedAt" | "ownerId" | "slug"> & { id?: string; coverFile?: File | null; logoFile?: File | null }) => Promise<string>
  updateEvent: (id: string, updates: Partial<Event> & { coverFile?: File | null; logoFile?: File | null }) => Promise<void>
  deleteEvent: (id: string) => Promise<void>

  addEdition: (edition: Omit<Edition, "id" | "slug" | "year"> & { year?: number }) => Promise<string>
  updateEdition: (id: string, updates: Partial<Edition>) => Promise<void>
  deleteEdition: (id: string) => Promise<void>

  addSpeaker: (speaker: AddSpeakerInput) => Promise<string>
  updateSpeaker: (id: string, updates: Partial<AddSpeakerInput>) => Promise<void>
  deleteSpeaker: (id: string) => Promise<void>
  toggleSpeakerCheckIn: (id: string) => Promise<void>
  bulkUpsertSpeakers: (eventId: string, rows: {
    id?: string
    firstName: string
    lastName: string
    email: string | null
    talkTitle: string
    bio: string
    roleName?: string
    editionName?: string
    identityDocumentType?: string | null
    identityDocumentNumber?: string | null
  }[]) => Promise<{ createdCount: number; updatedCount: number; errors: string[] }>
  addAgendaItem: (item: Omit<AgendaItem, "id">) => Promise<void>
  updateAgendaItem: (id: string, updates: Partial<AgendaItem>) => Promise<void>
  deleteAgendaItem: (id: string) => Promise<void>

  addAttendee: (attendee: Omit<Attendee, "id"> & {
    firstName?: string
    lastName?: string
    identityDocumentType?: string | null
    identityDocumentNumber?: string | null
  }) => Promise<void>
  toggleAttendeeCheckIn: (id: string) => Promise<void>
  deleteAttendee: (id: string) => Promise<void>
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .substring(0, 80)
}

function mapMainEvent(row: any): Event {
  return {
    id: row.id,
    organizationId: row.organization_id || row.organizationId,
    ownerId: row.owner_id || row.ownerId || "",
    slug: row.slug,
    name: row.name || row.eventName,
    shortDescription: row.short_description || row.description || "",
    about: row.about || row.details?.content || null,
    logoUrl: row.logo_url || row.logoUrl || "",
    coverUrl: row.cover_url || row.coverUrl || "",
    brandColors: row.brand_colors || { primary: "#000000", secondary: "#ffffff" },
    status: String(row.status || "DRAFT").toLowerCase() as Event["status"],
    isActive: row.is_active !== false,
    websiteUrl: row.website_url || "",
    contactEmail: row.contact_email || "",
    whatsappCommunityUrl: row.whatsapp_community_url || row.whatsappCommunityUrl || "",
    eventMode: row.event_mode || row.eventMode || "",
    venueAddress: row.venue_address || row.venueAddress || "",
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    socialLinks: row.social_links || { twitter: "", facebook: "", linkedin: "", instagram: "" },
    settings: row.settings || {},
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
  }
}

function mapEdition(row: any): Edition {
  return {
    id: row.id,
    mainEventId: row.main_event_id || row.mainEventId,
    slug: row.slug,
    year: row.year || new Date().getFullYear(),
    name: typeof row.name === "string" ? row.name : (row.name?.es || row.name?.en || "Edición"),
    description: typeof row.description === "string" ? row.description : (row.description?.es || row.description?.en || ""),
    coverUrl: row.coverUrl || row.cover_url || "",
    metaThumbnailUrl: row.metaThumbnailUrl || row.meta_thumbnail_url || "",
    startDate: row.start_date || row.startDate || "",
    endDate: row.end_date || row.endDate || "",
    isCurrent: Boolean(row.isCurrent ?? row.is_current),
    location: row.location || "",
    modality: row.modality || "",
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
  }
}

function mapParticipantRole(row: any): ParticipantRole {
  let name: Record<string, string> = { es: "" }
  if (typeof row.name === "string") {
    try {
      const parsed = JSON.parse(row.name)
      name = parsed && typeof parsed === "object" ? parsed : { es: row.name }
    } catch {
      name = { es: row.name }
    }
  } else if (row.name && typeof row.name === "object") {
    name = row.name
  }
  return {
    id: row.id,
    mainEventId: row.mainEventId || row.main_event_id,
    editionId: row.editionId || row.edition_id || null,
    slug: row.slug || (typeof row.name === "string" ? row.name : String(name.en || name.es || "").toLowerCase().replace(/[\s-]+/g, "_")),
    name: row.displayName ? { es: row.displayName, en: row.displayNameEn || "" } : name,
    badgeColor: row.badgeColor || row.badge_color,
    isActive: row.isActive ?? row.is_active ?? true,
    createdAt: row.createdAt || row.created_at || "",
    isSpeaker: row.isSpeaker ?? /^(speaker(?:_mg)?|ponente(?:_mg)?)$/.test(row.name || ""),
    certificateHours: row.certificateHours ?? 0,
    requiresAttendance: row.requiresAttendance ?? true,
    certificateText: row.certificateText ?? null,
    externalTemplateId: row.externalTemplateId ?? null,
  }
}

function mapThematicLine(row: any): ThematicLine {
  return {
    id: row.id,
    mainEventId: row.main_event_id,
    editionId: row.edition_id,
    name: row.name,
    description: row.description || null,
    iconUrl: row.icon_url || null,
    colorHex: row.color_hex || "#000000",
    isActive: row.is_active !== false,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  }
}

function mapEventTicket(row: any): EventTicket {
  return {
    id: row.id,
    mainEventId: row.main_event_id,
    editionId: row.edition_id,
    name: row.name,
    description: row.description || null,
    price: typeof row.price === "number" ? row.price : parseFloat(row.price || "0"),
    currency: row.currency || "USD",
    quantityTotal: row.quantity_total || 0,
    quantitySold: row.quantity_sold || 0,
    maxPerUser: row.max_per_user,
    salesStartAt: row.sales_start_at || null,
    salesEndAt: row.sales_end_at || null,
    isActive: row.is_active !== false,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  }
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  editions: [],
  speakers: [],
  speakersTotalCount: 0,
  agendaItems: [],
  attendees: [],
  roles: [],
  thematicLines: [],
  tickets: [],
  isLoading: false,

  loadData: async (organizationId, filters) => {
    set({ isLoading: true })
    try {
      const eventsData = await api.events.list(organizationId)
      // Defensa adicional: el API ya filtra por organizationId, pero el panel también
      // descarta cualquier registro que no pertenezca a la institución activa.
      let formattedEvents: Event[] = (eventsData || []).map(mapMainEvent).filter((event) => event.organizationId === organizationId)
      // Publicar el catálogo base inmediatamente. Las cargas secundarias (ediciones,
      // agenda, roles, etc.) no deben hacer que parezca que los eventos desaparecieron.
      set({ events: formattedEvents })
      if (filters?.search) {
        const search = filters.search.toLowerCase()
        formattedEvents = formattedEvents.filter((event) => event.name.toLowerCase().includes(search) || event.shortDescription.toLowerCase().includes(search))
      }
      if (filters?.status && filters.status !== "all") formattedEvents = formattedEvents.filter((event) => event.status === filters.status)
      const mainEventIds = formattedEvents.map((e) => e.id)

      // Fetch editions
      let formattedEditions: Edition[] = []
      if (mainEventIds.length > 0) {
        const editionsData = (await Promise.all(mainEventIds.map((eventId) => api.editions.list(eventId)))).flat()
        formattedEditions = editionsData.map(mapEdition)
      }

      // Filter by hasEditions (post-fetch)
      if (filters?.hasEditions === "true") {
        const idsWithEditions = new Set(formattedEditions.map((e) => e.mainEventId))
        formattedEvents = formattedEvents.filter((e) => idsWithEditions.has(e.id))
      }

      // Fetch agenda from backend
      let formattedAgenda: AgendaItem[] = []
      const editionIds = formattedEditions.map((ed) => ed.id)
      if (editionIds.length > 0) {
        const activitiesData = (await Promise.all(editionIds.map((editionId) => api.content.activities(editionId)))).flat()
        if (activitiesData) {
          formattedAgenda = activitiesData.map((act: any) => ({
            id: act.id,
            eventId: act.edition?.mainEventId || act.eventId || "",
            editionId: act.editionId || null,
            parentActivityId: act.parentActivityId || null,
            timeSlot: (() => {
              if (!act.startsAt || !act.endsAt) return "09:00 - 10:00";
              const dStart = new Date(act.startsAt);
              const dEnd = new Date(act.endsAt);
              if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime())) return "09:00 - 10:00";
              const hStart = String(dStart.getHours()).padStart(2, "0");
              const mStart = String(dStart.getMinutes()).padStart(2, "0");
              const hEnd = String(dEnd.getHours()).padStart(2, "0");
              const mEnd = String(dEnd.getMinutes()).padStart(2, "0");
              return `${hStart}:${mStart} - ${hEnd}:${mEnd}`;
            })(),
            title: act.title,
            stage: act.customLocation || "Escenario Principal",
            speakerId: act.speakerId || "",
            description: act.description || "",
            startTime: act.startsAt || null,
            endTime: act.endsAt || null,
            duration: act.duration || null,
            meetingUrl: act.meetingUrl || null,
            activityMode: act.activityMode || "PRESENCIAL",
            status: act.status || "PUBLIC",
            orderIndex: act.orderIndex || 0,
            startDate: act.startDate || null,
            endDate: act.endDate || null,
            createdAt: act.createdAt || null,
            updatedAt: act.updatedAt || null,
          }))
        }

      }

      // Fetch participant roles to match role_id without postgrest join constraint issues
      let formattedRoles: ParticipantRole[] = []
      if (mainEventIds.length > 0) {
        const rolesData = (await Promise.all(mainEventIds.map((eventId) => api.content.roles(eventId)))).flat()
        formattedRoles = rolesData.map(mapParticipantRole)
      }

      // Fetch speakers and attendees from event_participants
      const formattedAttendees: Attendee[] = []
      const formattedSpeakers: Speaker[] = []

      if (mainEventIds.length > 0) {
        const participantsData = (await Promise.all(formattedEditions.map((edition) => api.participants.list(edition.id)))).flat()

        if (participantsData) {
          participantsData.forEach((part: any) => {
            const profile = part.profile || {}
            const matchedRole = formattedRoles.find((r) => r.id === part.roleId)
            const roleName = String(matchedRole?.name?.es || matchedRole?.name?.en || "")
            const roleIdentifier = `${matchedRole?.slug || ""} ${roleName}`
            const isSpeakerRole = !!matchedRole?.isSpeaker || (part.roleAssignments || []).some((assignment: any) => assignment.role?.isSpeaker) || /ponente|speaker(?:[_\s-]|$)/i.test(roleIdentifier)
            const roleSlug = matchedRole?.slug || (isSpeakerRole ? "speaker" : roleName.toLowerCase().replace(/\s+/g, "-") || "attendee")
            const roleId = part.roleId || ""
            const fullName = `${profile.firstName || profile.first_name || ""} ${profile.lastName || profile.last_name || ""}`.trim() || "Participante"

            if (isSpeakerRole || roleSlug === "speaker" || roleSlug === "keynote-speaker") {
              formattedSpeakers.push({
                id: part.id,
                eventId: part.edition?.mainEventId || "",
                editionId: part.editionId,
                profileId: part.profileId || profile.id || "",
                roleId: roleId,
                roleSlug: roleSlug,
                firstName: profile.firstName || "",
                lastName: profile.lastName || "",
                name: fullName,
                email: profile.email || "",
                avatar: profile.avatarUrl || profile.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}`,
                talkTitle: part.ticketReference || "",
                talkDescription: profile.bio || "",
                bio: profile.bio || "",
                checkedIn: !!part.checkedIn,
                identityDocumentType: profile.identity_document_type || null,
                identityDocumentNumber: profile.identity_document_number || null,
                institution: profile.institution || "",
              })
            } else {
              formattedAttendees.push({
                id: part.id,
                eventId: part.edition?.mainEventId || "",
                editionId: part.editionId || null,
                profileId: part.profileId || profile.id || null,
                fullName,
                email: profile.email || "",
                ticketType: roleSlug === "vip" ? "VIP" : "General",
                registrationDate: part.registeredAt || new Date().toISOString(),
                checkedIn: !!part.checkedIn,
                source: "PARTICIPANT",
                avatarUrl: profile.avatarUrl || profile.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}`,
                identityDocumentType: profile.identity_document_type || null,
                identityDocumentNumber: profile.identity_document_number || null,
                roleId: roleId,
              })
            }
          })
        }

        const submissions = (await Promise.all(mainEventIds.map((eventId) => api.registrationForms.submissions(eventId)))).flat()
        submissions.forEach((submission: any) => {
          const answers = submission.answers && typeof submission.answers === "object" ? submission.answers : {}
          const fullName = String(answers.full_name || answers.name || answers.nombres_completos || [answers.first_name || answers.firstName || answers.nombres, answers.last_name || answers.lastName || answers.apellidos || answers.surname].filter(Boolean).join(" ") || submission.email || "Participante")
          const registrationData = { source: "FORM" as const, sourceFormTitle: submission.form?.title || "Formulario", sourceFormPurpose: submission.form?.purpose || "PARTICIPANT", sourceFormId: submission.formId, submissionId: submission.id, answers, formFields: submission.form?.fields || [] }
          const linkedParticipant = submission.participantId ? formattedAttendees.find((attendee) => attendee.id === submission.participantId) : undefined
          if (linkedParticipant) {
            Object.assign(linkedParticipant, registrationData, { fullName, email: submission.email || answers.email || linkedParticipant.email, editionId: submission.editionId || linkedParticipant.editionId })
          } else if (!submission.participantId) {
            formattedAttendees.push({ id: `form:${submission.id}`, eventId: submission.form?.mainEventId || "", editionId: submission.editionId || submission.form?.editionId || null, fullName, email: submission.email || answers.email || "", ticketType: "Inscripción", registrationDate: submission.submittedAt || "", checkedIn: false, ...registrationData })
          }
        })
      }

      // Fetch thematic lines
      let formattedThematicLines: ThematicLine[] = []
      if (mainEventIds.length > 0) {
        const thematicLinesData = (await Promise.all(mainEventIds.map((eventId) => api.content.thematicLines(eventId)))).flat()
        formattedThematicLines = thematicLinesData.map(mapThematicLine)
      }

      // Fetch event tickets
      let formattedTickets: EventTicket[] = []
      if (mainEventIds.length > 0) {
        const ticketsData = (await Promise.all(formattedEditions.map((edition) => api.content.tickets(edition.id)))).flat()
        formattedTickets = ticketsData.map(mapEventTicket)
      }

      set({
        events: formattedEvents,
        editions: formattedEditions,
        speakers: formattedSpeakers,
        agendaItems: formattedAgenda,
        attendees: formattedAttendees,
        roles: formattedRoles,
        thematicLines: formattedThematicLines,
        tickets: formattedTickets
      })
    } catch (e) {
      console.error("Error loading events:", e)
    } finally {
      set({ isLoading: false })
    }
  },

  addEvent: async (eventData) => {
    const user = useAuthStore.getState().user
    const org = useAuthStore.getState().selectedOrganization
    if (!user || !org) throw new Error("No user or organization")

    const id = eventData.id || crypto.randomUUID()
    const baseSlug = slugify(eventData.name)
    const slug = `${baseSlug}-${id.substring(0, 8)}`

    const { coverFile, logoFile, ...restData } = eventData

    let coverUrl = eventData.coverUrl || ""
    let logoUrl = eventData.logoUrl || ""

    try {
      const createdEvent = await api.events.create({ eventName: restData.name, startDate: new Date().toISOString(), organizationId: org.id, description: restData.shortDescription || undefined, coverUrl, logoUrl })
      if (coverFile) {
        coverUrl = (await api.media.upload(coverFile, { ownerType: "EVENT", ownerId: createdEvent.id, purpose: "COVER", organizationId: org.id })).url
      }
      if (logoFile) {
        logoUrl = (await api.media.upload(logoFile, { ownerType: "EVENT", ownerId: createdEvent.id, purpose: "LOGO", organizationId: org.id })).url
      }
      if (coverFile || logoFile) await api.events.update(createdEvent.id, { coverUrl, logoUrl })

      const newEvent: Event = {
        ...restData,
        logoUrl,
        coverUrl,
        id: createdEvent.id,
        organizationId: org.id,
        ownerId: user.id,
        slug,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        events: [newEvent, ...state.events]
      }))

      return createdEvent.id
    } catch (e) {
      console.error("Error adding event:", e)
      throw e
    }
  },

  updateEvent: async (id, updates) => {
    try {
      const { coverFile, logoFile, ...restUpdates } = updates
      let coverUrl = updates.coverUrl
      let logoUrl = updates.logoUrl

      if (coverFile) {
        try {
          const event = get().events.find((item) => item.id === id)
          const organizationId = event?.organizationId || useAuthStore.getState().selectedOrganization?.id
          if (!organizationId) throw new Error("No se encontró la institución del evento.")
          coverUrl = (await api.media.upload(coverFile, { ownerType: "EVENT", ownerId: id, purpose: "COVER", organizationId })).url
        } catch (err) {
          console.error("Failed to upload cover to R2:", err)
        }
      }
      if (logoFile) {
        try {
          const event = get().events.find((item) => item.id === id)
          const organizationId = event?.organizationId || useAuthStore.getState().selectedOrganization?.id
          if (!organizationId) throw new Error("No se encontró la institución del evento.")
          logoUrl = (await api.media.upload(logoFile, { ownerType: "EVENT", ownerId: id, purpose: "LOGO", organizationId })).url
        } catch (err) {
          console.error("Failed to upload logo to R2:", err)
        }
      }

      const mappedUpdates: any = {}
      if (restUpdates.name !== undefined) mappedUpdates.name = restUpdates.name
      if (restUpdates.shortDescription !== undefined) mappedUpdates.short_description = restUpdates.shortDescription
      if (restUpdates.about !== undefined) mappedUpdates.about = restUpdates.about
      if (logoUrl !== undefined) mappedUpdates.logo_url = logoUrl
      if (coverUrl !== undefined) mappedUpdates.cover_url = coverUrl
      if (restUpdates.brandColors !== undefined) mappedUpdates.brand_colors = restUpdates.brandColors
      if (restUpdates.status !== undefined) mappedUpdates.status = restUpdates.status
      if (restUpdates.isActive !== undefined) mappedUpdates.is_active = restUpdates.isActive
      if (restUpdates.websiteUrl !== undefined) mappedUpdates.website_url = restUpdates.websiteUrl
      if (restUpdates.contactEmail !== undefined) mappedUpdates.contact_email = restUpdates.contactEmail
      if (restUpdates.socialLinks !== undefined) mappedUpdates.social_links = restUpdates.socialLinks
      if (restUpdates.settings !== undefined) mappedUpdates.settings = restUpdates.settings
      mappedUpdates.updated_at = new Date().toISOString()

      if (Object.keys(mappedUpdates).length > 1) {
        await api.events.update(id, { eventName: mappedUpdates.name, description: restUpdates.shortDescription, detailContent: typeof restUpdates.about === "string" ? restUpdates.about : restUpdates.about?.es, status: mappedUpdates.status, coverUrl, logoUrl, contactEmail: restUpdates.contactEmail, whatsappCommunityUrl: restUpdates.whatsappCommunityUrl, eventMode: restUpdates.eventMode, venueAddress: restUpdates.venueAddress, latitude: restUpdates.latitude, longitude: restUpdates.longitude })
      }

      set((state) => ({
        events: state.events.map((e) => e.id === id ? {
          ...e,
          ...restUpdates,
          ...(logoUrl !== undefined ? { logoUrl } : {}),
          ...(coverUrl !== undefined ? { coverUrl } : {}),
          updatedAt: new Date().toISOString()
        } : e)
      }))
    } catch (e) {
      console.error("Error updating event:", e)
      throw e
    }
  },

  deleteEvent: async (id) => {
    try {
      const state = get()
      const editionIds = state.editions.filter((ed) => ed.mainEventId === id).map((ed) => ed.id)

      await api.events.remove(id)

      set((state) => ({
        events: state.events.filter((e) => e.id !== id),
        editions: state.editions.filter((ed) => ed.mainEventId !== id),
        speakers: state.speakers.filter((s) => s.eventId !== id),
        agendaItems: state.agendaItems.filter((a) => !editionIds.includes(a.eventId)),
        attendees: state.attendees.filter((at) => at.eventId !== id),
        thematicLines: state.thematicLines.filter((tl) => tl.mainEventId !== id)
      }))
    } catch (e) {
      console.error("Error deleting event:", e)
      throw e
    }
  },

  addEdition: async (editionData) => {
    const id = crypto.randomUUID()
    const baseSlug = slugify(typeof editionData.name === "string" ? editionData.name : "edicion")
    const slug = `${baseSlug}-${id.substring(0, 8)}`

    try {
      const yearVal = editionData.startDate
        ? parseInt(editionData.startDate.substring(0, 4))
        : new Date().getFullYear()

      const createdEdition = await api.editions.create(editionData.mainEventId, {
        name: String(editionData.name),
        ...(editionData.description ? { description: editionData.description } : {}),
        ...(editionData.coverUrl ? { coverUrl: editionData.coverUrl } : {}),
        ...(editionData.metaThumbnailUrl ? { metaThumbnailUrl: editionData.metaThumbnailUrl } : {}),
        ...(editionData.isCurrent !== undefined ? { isCurrent: editionData.isCurrent } : {}),
        startDate: editionData.startDate,
        ...(editionData.endDate ? { endDate: editionData.endDate } : {}),
        ...(editionData.modality ? { modality: editionData.modality } : {}),
        ...(editionData.location ? { location: editionData.location } : {}),
        ...(editionData.latitude !== undefined ? { latitude: editionData.latitude } : {}),
        ...(editionData.longitude !== undefined ? { longitude: editionData.longitude } : {}),
      })

      const newEdition: Edition = {
        id: createdEdition.id,
        mainEventId: editionData.mainEventId,
        slug,
        year: yearVal,
        name: String(editionData.name),
        description: editionData.description || "",
        coverUrl: editionData.coverUrl || "",
        metaThumbnailUrl: editionData.metaThumbnailUrl || "",
        startDate: editionData.startDate || "",
        endDate: editionData.endDate || "",
        isCurrent: editionData.isCurrent,
        location: editionData.location || "",
        modality: editionData.modality || "",
      }

      set((state) => ({
        editions: [...state.editions, newEdition]
      }))
      return createdEdition.id
    } catch (e) {
      console.error("Error adding edition:", e)
      throw e
    }
  },

  updateEdition: async (id, updates) => {
    try {
      const mappedUpdates: any = {}
      if (updates.name !== undefined) mappedUpdates.name = { es: updates.name }
      if (updates.description !== undefined) mappedUpdates.description = updates.description ? { es: updates.description } : null
      if (updates.coverUrl !== undefined) mappedUpdates.cover_url = updates.coverUrl || null
      if (updates.startDate !== undefined) mappedUpdates.start_date = updates.startDate
      if (updates.endDate !== undefined) mappedUpdates.end_date = updates.endDate
      if (updates.isCurrent !== undefined) mappedUpdates.is_current = updates.isCurrent
      if (updates.location !== undefined) mappedUpdates.location = updates.location || null
      if (updates.modality !== undefined) mappedUpdates.modality = updates.modality || null
      if (updates.latitude !== undefined) mappedUpdates.latitude = updates.latitude
      if (updates.longitude !== undefined) mappedUpdates.longitude = updates.longitude
      mappedUpdates.updated_at = new Date().toISOString()

      const currentEdition = get().editions.find((edition) => edition.id === id)
      if (!currentEdition) throw new Error("Edición no encontrada")
      await api.editions.update(currentEdition.mainEventId, id, { name: updates.name, description: updates.description, coverUrl: updates.coverUrl, metaThumbnailUrl: updates.metaThumbnailUrl, startDate: updates.startDate, endDate: updates.endDate, isCurrent: updates.isCurrent, modality: updates.modality, location: updates.location, latitude: updates.latitude, longitude: updates.longitude })

      set((state) => ({
        editions: state.editions.map((ed) => ed.id === id ? { ...ed, ...updates } : ed)
      }))
    } catch (e) {
      console.error("Error updating edition:", e)
      throw e
    }
  },

  deleteEdition: async (id) => {
    try {
      const currentEdition = get().editions.find((edition) => edition.id === id)
      if (!currentEdition) throw new Error("Edición no encontrada")
      await api.editions.remove(currentEdition.mainEventId, id)

      set((state) => ({
        editions: state.editions.filter((ed) => ed.id !== id),
        thematicLines: state.thematicLines.filter((tl) => tl.editionId !== id)
      }))
    } catch (e) {
      console.error("Error deleting edition:", e)
      throw e
    }
  },

  addSpeaker: async (speakerData) => {
    try {
      if (speakerData.editionId) {
        const created = await api.content.createSpeaker(speakerData.eventId, { editionId: speakerData.editionId, profileId: speakerData.profileId || undefined, roleId: speakerData.roleId || undefined, firstName: speakerData.firstName, lastName: speakerData.lastName, bio: speakerData.bio, email: speakerData.email || undefined, identityDocumentType: speakerData.identityDocumentType || undefined, identityDocumentNumber: speakerData.identityDocumentNumber || undefined })
        const profile = created.profile || {}
        const participantId = created.id
        set((state) => ({ speakers: [...state.speakers, { ...speakerData, id: participantId, profileId: profile.id || "", name: `${speakerData.firstName} ${speakerData.lastName}`.trim(), checkedIn: false }] as Speaker[] }))
        return participantId
      }
      let profileId = speakerData.profileId || crypto.randomUUID()
      let avatarUrl = speakerData.avatar

      if (speakerData.avatarFile) {
        try {
          const event = get().events.find((item) => item.id === speakerData.eventId)
          const organizationId = event?.organizationId || useAuthStore.getState().selectedOrganization?.id
          if (!organizationId) throw new Error("No se encontró la institución del ponente.")
          avatarUrl = (await api.media.upload(speakerData.avatarFile, { ownerType: "EVENT", ownerId: speakerData.eventId, purpose: "OTHER", organizationId })).url
        } catch (uploadErr) {
          console.error("Failed to upload speaker avatar to R2:", uploadErr)
        }
      }

      if (speakerData.profileId) await api.profiles.update(profileId, { firstName: speakerData.firstName, lastName: speakerData.lastName, bio: speakerData.bio, avatarUrl })
      else profileId = (await api.profiles.create({ firstName: speakerData.firstName, lastName: speakerData.lastName, bio: speakerData.bio, avatarUrl })).id
      const createdParticipant = await api.participants.add(speakerData.editionId, profileId)
      const participantId = createdParticipant.id
      const roleSlug = (await api.content.roles(speakerData.eventId)).find((role: any) => role.id === speakerData.roleId)?.slug || "speaker"

      const fullName = `${speakerData.firstName} ${speakerData.lastName}`.trim()
      const newSpeaker: Speaker = {
        id: participantId,
        eventId: speakerData.eventId,
        editionId: speakerData.editionId,
        profileId: profileId!,
        roleId: speakerData.roleId,
        roleSlug,
        firstName: speakerData.firstName,
        lastName: speakerData.lastName,
        name: fullName,
        email: speakerData.email,
        avatar: speakerData.avatar,
        talkTitle: speakerData.talkTitle,
        talkDescription: speakerData.talkDescription,
        bio: speakerData.bio,
        checkedIn: false,
        identityDocumentType: speakerData.identityDocumentType || null,
        identityDocumentNumber: speakerData.identityDocumentNumber || null,
        institution: speakerData.institution || "",
      }

      set((state) => ({
        speakers: [...state.speakers, newSpeaker]
      }))

      return participantId
    } catch (e) {
      console.error("Error adding speaker:", e)
      throw e
    }
  },

  updateSpeaker: async (id, updates) => {
    try {
      const updated = await api.content.updateSpeaker(id, { firstName: updates.firstName, lastName: updates.lastName, bio: updates.bio })
      const current = get().speakers.find((s) => s.id === id) || updated
      if (!current) throw new Error("Participante no encontrado")

      // 1. Update Profile in DB
      const profileUpdates: any = {}
      if (updates.firstName !== undefined) profileUpdates.first_name = updates.firstName
      if (updates.lastName !== undefined) profileUpdates.last_name = updates.lastName
      if (updates.email !== undefined) profileUpdates.email = updates.email || null
      if (updates.avatar !== undefined) profileUpdates.avatar_url = updates.avatar
      if (updates.bio !== undefined) profileUpdates.bio = updates.bio
      if (updates.identityDocumentType !== undefined) profileUpdates.identity_document_type = updates.identityDocumentType || null
      if (updates.identityDocumentNumber !== undefined) profileUpdates.identity_document_number = updates.identityDocumentNumber || null
      if (updates.institution !== undefined) profileUpdates.institution = updates.institution || null

      if (Object.keys(profileUpdates).length > 0) await api.profiles.update(current.profileId || updated.profileId, { firstName: updates.firstName, lastName: updates.lastName, bio: updates.bio, avatarUrl: updates.avatar })

      // 2. Update Participant in DB
      const participantUpdates: any = {}
      if (updates.editionId !== undefined) participantUpdates.edition_id = updates.editionId
      if (updates.roleId !== undefined) participantUpdates.role_id = updates.roleId
      if (updates.talkTitle !== undefined) participantUpdates.ticket_reference = updates.talkTitle

      if (Object.keys(participantUpdates).length > 0) {
        await api.participants.update(id, { editionId: updates.editionId, roleId: updates.roleId, ticketReference: updates.talkTitle })
      }

      // 3. Update local state
      let updatedRoleSlug = current.roleSlug
      if (updates.roleId && updates.roleId !== current.roleId) {
        const roleData = (await api.content.roles(current.eventId)).find((role: any) => role.id === updates.roleId)
        if (roleData) updatedRoleSlug = roleData.slug
      }

      set((state) => ({
        speakers: state.speakers.map((s) => {
          if (s.id === id) {
            const { profileId, email, ...safeUpdates } = updates
            const merged = { ...s, ...safeUpdates }
            if (updates.firstName !== undefined || updates.lastName !== undefined) {
              merged.name = `${updates.firstName ?? s.firstName} ${updates.lastName ?? s.lastName}`.trim()
            }
            merged.roleSlug = updatedRoleSlug
            return merged
          }
          return s
        })
      }))
    } catch (e) {
      console.error("Error updating speaker:", e)
      throw e
    }
  },

  deleteSpeaker: async (id) => {
    try {
      await api.content.removeSpeaker(id)

      set((state) => ({
        speakers: state.speakers.filter((s) => s.id !== id),
        agendaItems: state.agendaItems.map((a) => a.speakerId === id ? { ...a, speakerId: "" } : a)
      }))
    } catch (e) {
      console.error("Error deleting speaker:", e)
    }
  },

  addAgendaItem: async (itemData) => {
      try {
      if (!itemData.editionId) throw new Error("La agenda requiere una edición")
      const created = await api.content.createActivity(itemData.editionId, { title: itemData.title, description: itemData.description, startsAt: itemData.startTime, endsAt: itemData.endTime })

      set((state) => ({
        agendaItems: [...state.agendaItems, { id: created.id, ...itemData }]
      }))
    } catch (e) {
      console.error("Error adding agenda activity:", e)
      throw e
    }
  },

  updateAgendaItem: async (id, updates) => {
    try {
      const mappedUpdates: any = {}
      if (updates.title !== undefined) mappedUpdates.activity_name = updates.title
      if (updates.description !== undefined) mappedUpdates.description = updates.description
      if (updates.stage !== undefined) mappedUpdates.custom_location = updates.stage
      if (updates.speakerId !== undefined) mappedUpdates.speaker_id = updates.speakerId || null
      if (updates.startTime !== undefined) mappedUpdates.start_time = updates.startTime
      if (updates.endTime !== undefined) mappedUpdates.end_time = updates.endTime
      if (updates.duration !== undefined) mappedUpdates.duration = updates.duration
      if (updates.meetingUrl !== undefined) mappedUpdates.meeting_url = updates.meetingUrl
      if (updates.activityMode !== undefined) mappedUpdates.activity_mode = updates.activityMode
      if (updates.status !== undefined) mappedUpdates.status = updates.status
      if (updates.orderIndex !== undefined) mappedUpdates.order_index = updates.orderIndex
      if (updates.startDate !== undefined) mappedUpdates.start_date = updates.startDate
      if (updates.endDate !== undefined) mappedUpdates.end_date = updates.endDate
      if (updates.editionId !== undefined) mappedUpdates.edition_id = updates.editionId || null
      if (updates.parentActivityId !== undefined) mappedUpdates.parent_activity_id = updates.parentActivityId || null

      await api.content.updateActivity(id, { title: updates.title, description: updates.description, startsAt: updates.startTime, endsAt: updates.endTime })

      set((state) => ({
        agendaItems: state.agendaItems.map((a) => a.id === id ? { ...a, ...updates } : a)
      }))
    } catch (e) {
      console.error("Error updating agenda item:", e)
      throw e
    }
  },

  deleteAgendaItem: async (id) => {
    try {
      await api.content.removeActivity(id)
      set((state) => ({
        agendaItems: state.agendaItems.filter((a) => a.id !== id)
      }))
    } catch (e) {
      console.error("Error deleting agenda item:", e)
    }
  },

  addAttendee: async (attendeeData) => {
    try {
      const state = get()
      const createdManualParticipant = await api.participants.addManual(attendeeData.eventId, { editionId: attendeeData.editionId || undefined, firstName: attendeeData.firstName, lastName: attendeeData.lastName, email: attendeeData.email, identityDocumentType: attendeeData.identityDocumentType, identityDocumentNumber: attendeeData.identityDocumentNumber })
      const manualOrganizationId = state.events.find((event) => event.id === attendeeData.eventId)?.organizationId
      if (manualOrganizationId) await get().loadData(manualOrganizationId)
      void createdManualParticipant
    } catch (e) {
      console.error("Error adding attendee:", e)
      throw e
    }
  },

  toggleAttendeeCheckIn: async (id) => {
    try {
      const attendee = get().attendees.find((a) => a.id === id)
      if (!attendee) return

      await api.participants.update(id, { checkedIn: !attendee.checkedIn })

      set((state) => ({
        attendees: state.attendees.map((at) => at.id === id ? { ...at, checkedIn: !at.checkedIn } : at)
      }))
    } catch (e) {
      console.error("Error toggling check-in:", e)
    }
  },
  deleteAttendee: async (id) => {
    try {
      await api.participants.remove(id)

      set((state) => ({
        attendees: state.attendees.filter((at) => at.id !== id)
      }))
    } catch (e) {
      console.error("Error deleting attendee:", e)
    }
  },

  loadEditions: async (mainEventId) => {
    try {
      const rows = await api.editions.list(mainEventId)
      const loaded = (rows || []).map((row: any) => mapEdition({ ...row, mainEventId: row.mainEventId || mainEventId }))
      set((state) => ({ editions: [...state.editions.filter((edition) => edition.mainEventId !== mainEventId), ...loaded] }))
    } catch (error) {
      console.error("Error loading editions:", error)
    }
  },

  loadRoles: async (mainEventId) => {
    try {
      const data = await api.content.roles(mainEventId)
      const loaded = (data || []).map(mapParticipantRole)
      set((state) => ({ roles: [...state.roles.filter((role) => role.mainEventId !== mainEventId), ...loaded] }))
    } catch (e) {
      console.error("Error loading participant roles:", e)
    }
  },

  loadFilteredSpeakers: async (eventId, filters) => {
    set({ isLoading: true })
    try {
      const rows = await api.content.speakers(eventId, filters?.editionId && filters.editionId !== "all" ? filters.editionId : undefined)
      let formatted = rows.map((row: any) => { const p = row.profile || {}; const name = `${p.firstName || ""} ${p.lastName || ""}`.trim() || "Participante"; return { id: row.id, eventId, editionId: row.editionId, profileId: p.id || "", roleId: row.roleId || "", roleSlug: row.role?.name?.toLowerCase().replace(/\s+/g, "-") || "speaker", firstName: p.firstName || "", lastName: p.lastName || "", name, email: p.email || "", avatar: p.avatarUrl || "", talkTitle: "", talkDescription: p.bio || "", bio: p.bio || "", checkedIn: !!row.checkedIn, identityDocumentType: null, identityDocumentNumber: null, institution: "" } as Speaker })
      if (filters?.search) { const query = filters.search.toLowerCase(); formatted = formatted.filter((speaker) => speaker.name.toLowerCase().includes(query) || (speaker.email || "").toLowerCase().includes(query)) }
      set({ speakers: formatted, speakersTotalCount: formatted.length, isLoading: false })
      return
      /* legacy speaker query removed; API response above is authoritative.
      const { data: rolesData, error: rolesError } = await legacyClient
        .from("participant_roles")
        .select("*")
        .eq("main_event_id", eventId)

      if (rolesError) throw rolesError

      const formattedRoles = (rolesData || []).map(mapParticipantRole)
      const speakerRoleIds = formattedRoles
        .filter((r) => r.slug === "speaker" || r.slug === "keynote-speaker")
        .map((r) => r.id)

      let profileIds: string[] | null = null
      if (filters?.search && filters.search.trim()) {
        const searchVal = `%${filters.search.trim()}%`
        const { data: profiles, error: profileError } = await legacyClient
          .from("profiles")
          .select("id")
          .or(`first_name.ilike.${searchVal},last_name.ilike.${searchVal},email.ilike.${searchVal}`)

        if (profileError) throw profileError
        profileIds = (profiles || []).map((p) => p.id)
      }

      if (profileIds !== null && profileIds.length === 0) {
        set((state) => {
          const otherSpeakers = state.speakers.filter((s) => s.eventId !== eventId)
          return {
            speakers: otherSpeakers,
            speakersTotalCount: 0,
            roles: formattedRoles,
            isLoading: false
          }
        })
        return
      }

      if (speakerRoleIds.length === 0) {
        set((state) => {
          const otherSpeakers = state.speakers.filter((s) => s.eventId !== eventId)
          return {
            speakers: otherSpeakers,
            speakersTotalCount: 0,
            roles: formattedRoles,
            isLoading: false
          }
        })
        return
      }

      let countQuery = legacyClient
        .from("event_participants")
        .select("id", { count: "exact", head: true })
        .eq("main_event_id", eventId)
        .in("role_id", speakerRoleIds)

      if (filters?.editionId && filters.editionId !== "all") {
        countQuery = countQuery.eq("edition_id", filters.editionId)
      }
      if (profileIds !== null) {
        countQuery = countQuery.in("profile_id", profileIds)
      }

      const { count, error: countError } = await countQuery
      if (countError) throw countError
      const totalCount = count || 0

      let query = legacyClient
        .from("event_participants")
        .select(`
          id,
          main_event_id,
          edition_id,
          role_id,
          check_in_status,
          ticket_reference,
          created_at,
          profile:profile_id (
            id, first_name, last_name, email, avatar_url, bio, identity_document_type, identity_document_number, institution
          )
        `)
        .eq("main_event_id", eventId)
        .in("role_id", speakerRoleIds)

      if (filters?.editionId && filters.editionId !== "all") {
        query = query.eq("edition_id", filters.editionId)
      }
      if (profileIds !== null) {
        query = query.in("profile_id", profileIds)
      }

      const page = filters?.page || 1
      const pageSize = filters?.pageSize || 20
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      query = query.range(from, to)

      // Ordering: default is created_at desc; name sort is client-side after fetch
      // since name lives on profiles (joined), we always fetch ordered by created_at
      // and sort client-side when field === 'name'
      query = query.order("created_at", { ascending: false })

      const { data: participantsData, error: participantsError } = await query
      if (participantsError) throw participantsError

      const formattedSpeakers: Speaker[] = []
      if (participantsData) {
        participantsData.forEach((part: any) => {
          const profile = part.profile || {}
          const matchedRole = formattedRoles.find((r) => r.id === part.role_id)
          const roleSlug = matchedRole?.slug || "attendee"
          const roleId = part.role_id || ""
          const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Participante"

          formattedSpeakers.push({
            id: part.id,
            eventId: part.main_event_id,
            editionId: part.edition_id,
            profileId: profile.id || "",
            roleId: roleId,
            roleSlug: roleSlug,
            firstName: profile.first_name || "",
            lastName: profile.last_name || "",
            name: fullName,
            email: profile.email || "",
            avatar: profile.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}`,
            talkTitle: part.ticket_reference || "",
            talkDescription: profile.bio || "",
            bio: profile.bio || "",
            checkedIn: !!part.check_in_status,
            identityDocumentType: profile.identity_document_type || null,
            identityDocumentNumber: profile.identity_document_number || null,
            institution: profile.institution || "",
          })
        })
      }

      // Apply name sort client-side if requested (name comes from joined profile)
      let sorted = formattedSpeakers
      if (filters?.order?.field === "name") {
        sorted = [...formattedSpeakers].sort((a, b) =>
          filters.order!.direction === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name)
        )
      }

      set((state) => {
        const otherSpeakers = state.speakers.filter((s) => s.eventId !== eventId)
        return {
          speakers: [...otherSpeakers, ...sorted],
          speakersTotalCount: totalCount,
          roles: formattedRoles
        }
      })
      */
    } catch (e) {
      console.error("Error loading filtered speakers:", e)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchAllSpeakersForExport: async (eventId, filters) => {
    try {
      const rows = await api.content.speakers(eventId, filters?.editionId && filters.editionId !== "all" ? filters.editionId : undefined)
      return rows.map((row: any) => { const p = row.profile || {}; const name = `${p.firstName || ""} ${p.lastName || ""}`.trim(); return { id: row.id, eventId, editionId: row.editionId, profileId: p.id || "", roleId: "", roleSlug: "speaker", firstName: p.firstName || "", lastName: p.lastName || "", name, email: p.email || null, avatar: p.avatarUrl || "", talkTitle: "", talkDescription: p.bio || "", bio: p.bio || "", checkedIn: !!row.checkedIn, identityDocumentType: null, identityDocumentNumber: null, institution: null } as Speaker })
      /* legacy export query removed; API response above is authoritative.
      const { data: rolesData, error: rolesError } = await legacyClient
        .from("participant_roles")
        .select("*")
        .eq("main_event_id", eventId)

      if (rolesError) throw rolesError

      const formattedRoles = (rolesData || []).map(mapParticipantRole)
      const speakerRoleIds = formattedRoles
        .filter((r) => r.slug === "speaker" || r.slug === "keynote-speaker")
        .map((r) => r.id)

      let profileIds: string[] | null = null
      if (filters?.search && filters.search.trim()) {
        const searchVal = `%${filters.search.trim()}%`
        const { data: profiles, error: profileError } = await legacyClient
          .from("profiles")
          .select("id")
          .or(`first_name.ilike.${searchVal},last_name.ilike.${searchVal},email.ilike.${searchVal}`)

        if (profileError) throw profileError
        profileIds = (profiles || []).map((p) => p.id)
      }

      if (profileIds !== null && profileIds.length === 0) return []
      if (speakerRoleIds.length === 0) return []

      let query = legacyClient
        .from("event_participants")
        .select(`
          id,
          main_event_id,
          edition_id,
          role_id,
          check_in_status,
          ticket_reference,
          created_at,
          profile:profile_id (
            id, first_name, last_name, email, avatar_url, bio, identity_document_type, identity_document_number, institution
          )
        `)
        .eq("main_event_id", eventId)
        .in("role_id", speakerRoleIds)

      if (filters?.editionId && filters.editionId !== "all") {
        query = query.eq("edition_id", filters.editionId)
      }
      if (profileIds !== null) {
        query = query.in("profile_id", profileIds)
      }

      const { data: participantsData, error: participantsError } = await query
      if (participantsError) throw participantsError

      const formattedSpeakers: Speaker[] = []
      if (participantsData) {
        participantsData.forEach((part: any) => {
          const profile = part.profile || {}
          const matchedRole = formattedRoles.find((r) => r.id === part.role_id)
          const roleSlug = matchedRole?.slug || "attendee"
          const roleId = part.role_id || ""
          const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Participante"

          formattedSpeakers.push({
            id: part.id,
            eventId: part.main_event_id,
            editionId: part.edition_id,
            profileId: profile.id || "",
            roleId: roleId,
            roleSlug: roleSlug,
            firstName: profile.first_name || "",
            lastName: profile.last_name || "",
            name: fullName,
            email: profile.email || "",
            avatar: profile.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}`,
            talkTitle: part.ticket_reference || "",
            talkDescription: profile.bio || "",
            bio: profile.bio || "",
            checkedIn: !!part.check_in_status,
            identityDocumentType: profile.identity_document_type || null,
            identityDocumentNumber: profile.identity_document_number || null,
            institution: profile.institution || "",
          })
        })
      }

      return formattedSpeakers
      */
    } catch (e) {
      console.error("Error fetching all speakers for export:", e)
      return []
    }
  },

  addRole: async (roleData) => {
    try {
      const created = await api.content.createRole({ ...roleData, name: roleData.slug, displayName: roleData.name.es, displayNameEn: roleData.name.en || null })
      const id = created.id

      const mapped: ParticipantRole = {
        ...mapParticipantRole(created),
        id,
        mainEventId: roleData.mainEventId,
        editionId: roleData.editionId,
        slug: roleData.slug,
        name: roleData.name,
        badgeColor: roleData.badgeColor,
        isActive: roleData.isActive,
        createdAt: new Date().toISOString(),
      }

      set((state) => ({
        roles: [mapped, ...state.roles]
      }))
    } catch (e) {
      console.error("Error adding role:", e)
      throw e
    }
  },

  updateRole: async (id, updates) => {
    try {
      const updated = await api.content.updateRole(id, { ...updates, name: updates.slug, displayName: updates.name?.es, displayNameEn: updates.name?.en || null })

      set((state) => ({
        roles: state.roles.map((r) => r.id === id ? mapParticipantRole(updated) : r)
      }))
    } catch (e) {
      console.error("Error updating role:", e)
      throw e
    }
  },

  deleteRole: async (id) => {
    try {
      await api.content.removeRole(id)

      set((state) => ({
        roles: state.roles.filter((r) => r.id !== id)
      }))
    } catch (e) {
      console.error("Error deleting role:", e)
      throw e
    }
  },

  loadThematicLines: async (mainEventId) => {
    try {
      const data = await api.content.thematicLines(mainEventId)
      const mapped = (data || []).map(mapThematicLine)
      set((state) => {
        const others = state.thematicLines.filter((tl) => tl.mainEventId !== mainEventId)
        return { thematicLines: [...others, ...mapped] }
      })
    } catch (e) {
      console.error("Error loading thematic lines:", e)
    }
  },

  addThematicLine: async (thematicLineData) => {
    try {
      const created = await api.content.createThematicLine(thematicLineData.mainEventId, { name: thematicLineData.name, description: thematicLineData.description })
      const id = created.id

      const mapped: ThematicLine = {
        id,
        mainEventId: thematicLineData.mainEventId,
        editionId: thematicLineData.editionId,
        name: thematicLineData.name,
        description: thematicLineData.description,
        iconUrl: thematicLineData.iconUrl,
        colorHex: thematicLineData.colorHex,
        isActive: thematicLineData.isActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        thematicLines: [mapped, ...state.thematicLines]
      }))
    } catch (e) {
      console.error("Error adding thematic line:", e)
      throw e
    }
  },

  updateThematicLine: async (id, updates) => {
    try {
      await api.content.updateThematicLine(id, { name: updates.name, description: updates.description })

      set((state) => ({
        thematicLines: state.thematicLines.map((tl) =>
          tl.id === id ? { ...tl, ...updates, updatedAt: new Date().toISOString() } : tl
        )
      }))
    } catch (e) {
      console.error("Error updating thematic line:", e)
      throw e
    }
  },

  deleteThematicLine: async (id) => {
    try {
      await api.content.removeThematicLine(id)

      set((state) => ({
        thematicLines: state.thematicLines.filter((tl) => tl.id !== id)
      }))
    } catch (e) {
      console.error("Error deleting thematic line:", e)
      throw e
    }
  },

  loadTickets: async (mainEventId) => {
    try {
      const editionIds = get().editions.filter((edition) => edition.mainEventId === mainEventId).map((edition) => edition.id)
      const data = (await Promise.all(editionIds.map((editionId) => api.content.tickets(editionId)))).flat()
      const mapped = (data || []).map(mapEventTicket)
      set((state) => {
        const others = state.tickets.filter((t) => t.mainEventId !== mainEventId)
        return { tickets: [...others, ...mapped] }
      })
    } catch (e) {
      console.error("Error loading event tickets:", e)
    }
  },

  addTicket: async (ticketData) => {
    try {
      if (!ticketData.editionId) throw new Error("La entrada requiere una edición")
      const created = await api.content.createTicket(ticketData.editionId, { name: ticketData.name, price: ticketData.price, capacity: ticketData.quantityTotal })

      const mapped: EventTicket = {
        id: created.id,
        mainEventId: ticketData.mainEventId,
        editionId: ticketData.editionId,
        name: ticketData.name,
        description: ticketData.description,
        price: ticketData.price,
        currency: ticketData.currency,
        quantityTotal: ticketData.quantityTotal,
        quantitySold: 0,
        maxPerUser: ticketData.maxPerUser,
        salesStartAt: ticketData.salesStartAt,
        salesEndAt: ticketData.salesEndAt,
        isActive: ticketData.isActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        tickets: [mapped, ...state.tickets]
      }))
    } catch (e) {
      console.error("Error adding ticket:", e)
      throw e
    }
  },

  updateTicket: async (id, updates) => {
    try {
      const dbUpdates: any = {}
      if (updates.mainEventId !== undefined) dbUpdates.main_event_id = updates.mainEventId
      if (updates.editionId !== undefined) dbUpdates.edition_id = updates.editionId
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.description !== undefined) dbUpdates.description = updates.description
      if (updates.price !== undefined) dbUpdates.price = updates.price
      if (updates.currency !== undefined) dbUpdates.currency = updates.currency
      if (updates.quantityTotal !== undefined) dbUpdates.quantity_total = updates.quantityTotal
      if (updates.maxPerUser !== undefined) dbUpdates.max_per_user = updates.maxPerUser
      if (updates.salesStartAt !== undefined) dbUpdates.sales_start_at = updates.salesStartAt
      if (updates.salesEndAt !== undefined) dbUpdates.sales_end_at = updates.salesEndAt
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive
      dbUpdates.updated_at = new Date().toISOString()

      await api.content.updateTicket(id, { name: updates.name, price: updates.price, capacity: updates.quantityTotal })

      set((state) => ({
        tickets: state.tickets.map((t) =>
          t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
        )
      }))
    } catch (e) {
      console.error("Error updating ticket:", e)
      throw e
    }
  },

  deleteTicket: async (id) => {
    try {
      await api.content.removeTicket(id)

      set((state) => ({
        tickets: state.tickets.filter((t) => t.id !== id)
      }))
    } catch (e) {
      console.error("Error deleting ticket:", e)
      throw e
    }
  },

  toggleSpeakerCheckIn: async (id) => {
    try {
      const speaker = get().speakers.find((s) => s.id === id)
      if (!speaker) return

      await api.participants.update(id, { checkedIn: !speaker.checkedIn })

      set((state) => ({
        speakers: state.speakers.map((sp) => sp.id === id ? { ...sp, checkedIn: !sp.checkedIn } : sp)
      }))
    } catch (e) {
      console.error("Error toggling speaker check-in:", e)
    }
  },

  bulkUpsertSpeakers: async (eventId, rows) => {
    const errors: string[] = []
    let createdCount = 0
    for (let i = 0; i < rows.length; i++) { const row = rows[i]; try { const edition = get().editions.find((item) => !row.editionName || item.name.toLowerCase() === row.editionName.toLowerCase()); if (!edition) throw new Error("Edición no encontrada"); await api.content.createSpeaker(eventId, { editionId: edition.id, firstName: row.firstName, lastName: row.lastName, bio: row.bio }); createdCount++ } catch (error) { errors.push(`Fila ${i + 2}: ${error instanceof Error ? error.message : "Error al importar"}`) } }
    return { createdCount, updatedCount: 0, errors }
    /* legacy import retained below for reference during rollout
    let currentRoles = get().roles
    if (currentRoles.length === 0) {
      const { data } = await legacyClient.from("participant_roles").select("*").eq("main_event_id", eventId)
      if (data) {
        currentRoles = data.map(mapParticipantRole)
      }
    }
    let currentEditions = get().editions.filter(ed => ed.mainEventId === eventId)
    if (currentEditions.length === 0) {
      const { data } = await legacyClient.from("editions").select("*").eq("main_event_id", eventId)
      if (data) {
        currentEditions = data.map(mapEdition)
      }
    }

    let createdCount = 0
    let updatedCount = 0
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        if (!row.firstName || !row.lastName) {
          errors.push(`Fila ${i + 2}: Nombre y Apellido son requeridos.`)
          continue
        }

        // Find role ID
        let roleId = ""
        if (row.roleName) {
          const matchedRole = currentRoles.find(r => 
            r.name.es?.toLowerCase() === row.roleName?.toLowerCase() ||
            r.name.en?.toLowerCase() === row.roleName?.toLowerCase() ||
            r.slug?.toLowerCase() === row.roleName?.toLowerCase()
          )
          if (matchedRole) roleId = matchedRole.id
        }
        if (!roleId) {
          const defaultRole = currentRoles.find(r => r.slug === "speaker" || r.slug === "keynote-speaker") || currentRoles[0]
          roleId = defaultRole?.id || ""
        }

        // Find edition ID
        let editionId: string | null = null
        if (row.editionName) {
          const matchedEd = currentEditions.find(ed => ed.name.toLowerCase() === row.editionName?.toLowerCase())
          if (matchedEd) editionId = matchedEd.id
        }
        if (!editionId) {
          const currentEd = currentEditions.find(ed => ed.isCurrent) || currentEditions[0]
          editionId = currentEd?.id || null
        }

        // Determine if speaker already exists in event
        let existingSpeaker = null
        if (row.id) {
          existingSpeaker = get().speakers.find(s => s.id === row.id)
        }
        if (!existingSpeaker && row.email) {
          existingSpeaker = get().speakers.find(s => s.eventId === eventId && s.email?.toLowerCase() === row.email?.toLowerCase())
        }

        if (existingSpeaker) {
          // Update speaker
          await get().updateSpeaker(existingSpeaker.id, {
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            talkTitle: row.talkTitle,
            bio: row.bio,
            roleId,
            editionId: editionId || undefined,
            identityDocumentType: row.identityDocumentType,
            identityDocumentNumber: row.identityDocumentNumber,
          })
          updatedCount++
        } else {
          // Insert speaker
          await get().addSpeaker({
            eventId,
            editionId: editionId || "",
            profileId: null,
            roleId,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            avatar: "",
            talkTitle: row.talkTitle,
            talkDescription: row.bio,
            bio: row.bio,
            identityDocumentType: row.identityDocumentType,
            identityDocumentNumber: row.identityDocumentNumber,
          })
          createdCount++
        }
      } catch (err: any) {
        console.error(`Error processing row ${i + 2}:`, err)
        errors.push(`Fila ${i + 2} (${row.firstName} ${row.lastName}): ${err.message || err}`)
      }
    }

    // Refresh speakers in local state
    await get().loadFilteredSpeakers(eventId)

    return { createdCount, updatedCount, errors } */
  }
}))
