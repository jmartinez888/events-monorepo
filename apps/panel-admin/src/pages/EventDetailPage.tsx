import { useEffect, useState } from "react"
import { useParams, useNavigate, NavLink, Outlet, useLocation } from "react-router-dom"
import { useAuthStore } from "@/store/auth.store"
import { useEventStore } from "@/store/event.store"
import { cn } from "@/lib/utils"
import { AlertCircle, Menu, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { api } from "@/api/client"

const NAV_ITEMS = [
  { to: "info", label: "General" },
  { to: "editions", label: "Ediciones" },
  { to: "speakers", label: "Ponentes" },
  { to: "agenda", label: "Agenda" },
  { to: "attendees", label: "Participantes" },
  { to: "registrations", label: "Inscripciones" },
  { to: "roles", label: "Roles" },
  { to: "thematic-lines", label: "Líneas Temáticas" },
  { to: "tickets", label: "Tickets" },
  { to: "certificates", label: "Certificados" },
  { to: "files", label: "Materiales" },
  { to: "integrations", label: "Integraciones" },
  { to: "forms", label: "Formularios" },
  { to: "public-api", label: "API pública" },
]

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { selectedOrganization } = useAuthStore()
  const {
    events,
    editions,
    speakers,
    agendaItems,
    attendees,
    roles,
    thematicLines,
    tickets,
    isLoading,
    loadData,
    loadEditions,
    loadRoles,
  } = useEventStore()
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [setupChecked, setSetupChecked] = useState(false)

  useEffect(() => {
    // No recargamos todo el catálogo al navegar entre pestañas del mismo evento:
    // las secciones de ediciones y ponentes consultan sus datos puntualmente.
    if (selectedOrganization?.id && !events.some((item) => item.id === id)) {
      loadData(selectedOrganization.id)
    }
  }, [selectedOrganization?.id, id, events, loadData])

  useEffect(() => {
    if (id) {
      loadEditions(id)
      loadRoles(id)
    }
  }, [id, loadEditions, loadRoles])

  const event = events.find((e) => e.id === id)

  useEffect(() => {
    if (!id || !event) return
    api.events
      .setup(id)
      .then((setup) => {
        setSetupChecked(true)
        const allowedDuringSetup =
          setup.completed ||
          pathname.endsWith(`/events/${id}/info`) ||
          (pathname.endsWith(`/events/${id}/roles`) && setup.editionCompleted)
        if (!allowedDuringSetup) navigate(`/dashboard/events/${id}/setup`, { replace: true })
      })
      .catch(() => setSetupChecked(true))
  }, [id, event?.id, navigate, pathname])

  if (event && !setupChecked) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">Cargando evento…</p>
      </div>
    )
  }

  const eventEditions = editions.filter((ed) => ed.mainEventId === id)
  const eventSpeakers = speakers.filter((sp) => sp.eventId === id)
  const eventAgenda = agendaItems.filter((ag) => ag.eventId === id)
  const eventAttendees = attendees.filter((at) => at.eventId === id)
  const eventRoles = roles.filter((r) => r.mainEventId === id)
  const eventThematicLines = thematicLines.filter((tl) => tl.mainEventId === id)
  const eventTickets = tickets.filter((tk) => tk.mainEventId === id)

  const counts: Record<string, number> = {
    editions: eventEditions.length,
    speakers: eventSpeakers.length,
    agenda: eventAgenda.length,
    attendees: eventAttendees.length,
    roles: eventRoles.length,
    "thematic-lines": eventThematicLines.length,
    tickets: eventTickets.length,
  }

  if (isLoading && !event) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans flex flex-col lg:flex-row">
        {/* Sidebar / Aside Navigation (Desktop) - Fixed to the left */}
        <aside className="hidden lg:flex flex-col w-60 fixed left-0 top-0 bottom-0 border-r border-border bg-card p-6 z-20 overflow-y-auto">
          {/* Volver Link Skeleton */}
          <div className="flex items-center gap-2 mb-5">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>

          {/* Event Title Header Skeleton */}
          <div className="mb-6 pb-4 border-b border-border/60">
            <Skeleton className="h-5 w-40 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>

          <nav className="flex flex-col gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center py-1">
                <Skeleton className="h-4 w-24" />
                {i % 3 === 0 && <Skeleton className="h-4 w-6 rounded-full" />}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content Area - Shifted to the right by the fixed sidebar width on lg screens */}
        <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
          <main className="container mx-auto py-12 px-6 flex-1 w-full">
            {/* Sheet / Drawer Navigation (Mobile & Tablet) */}
            <div className="lg:hidden w-full mb-6">
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>

            {/* Content Area Skeleton */}
            <div className="max-w-7xl w-full space-y-6">
              {/* Specific Subpage PageHeader Skeleton */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-7 w-48" />
                  <Skeleton className="h-4 w-[280px] md:w-[450px]" />
                </div>
                <Skeleton className="h-8 w-28 rounded-lg self-start md:self-auto shrink-0" />
              </div>

              {/* Simulated DataTable / Form Skeleton */}
              <div className="border border-border rounded-xl bg-card p-6 space-y-5 shadow-xs">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Skeleton className="h-9 w-full sm:max-w-xs rounded-xl" />
                  <Skeleton className="h-9 w-full sm:max-w-xs rounded-xl" />
                </div>
                <div className="space-y-3">
                  <div className="flex gap-4 border-b border-border/40 pb-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-1/12 ml-auto" />
                  </div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-4 items-center py-2 border-b border-border/20 last:border-none">
                      <div className="flex items-center gap-3 w-1/3">
                        <Skeleton className="size-8 rounded-lg shrink-0" />
                        <div className="space-y-1.5 w-full">
                          <Skeleton className="h-3.5 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                      <Skeleton className="h-4 w-1/4" />
                      <Skeleton className="h-4 w-1/4" />
                      <div className="w-1/12 ml-auto flex justify-end gap-2">
                        <Skeleton className="size-7 rounded-lg animate-pulse" />
                        <Skeleton className="size-7 rounded-lg animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="container mx-auto px-6 py-12 flex-1 w-full">
          <div className="p-8 text-center border border-border bg-card rounded-xl space-y-4">
            <AlertCircle className="size-12 mx-auto text-destructive" />
            <h3 className="font-bold text-lg">Evento no encontrado</h3>
            <p className="text-sm text-muted-foreground">El evento seleccionado no existe o pertenece a otra organización.</p>
            <Button onClick={() => navigate("/dashboard/events")} variant="outline">
              Volver a Eventos
            </Button>
          </div>
        </main>
      </div>
    )
  }

  const basePath = `/dashboard/events/${event.id}`
  const isWidePage = pathname.includes("/agenda") || pathname.includes("/speakers/import")
  const activeItem = NAV_ITEMS.find((item) => pathname.includes(item.to))
  const activeLabel = activeItem ? activeItem.label : "Secciones"

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col lg:flex-row">
      {/* Sidebar / Aside Navigation (Desktop) - Fixed to the left */}
      <aside className="hidden lg:flex flex-col w-60 fixed left-0 top-0 bottom-0 border-r border-border bg-card p-6 z-20 overflow-y-auto">
        {/* Volver Link */}
        <button
          onClick={() => navigate("/dashboard/events")}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground mb-5 group transition-colors self-start cursor-pointer"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-1" />
          <span>Volver a Eventos</span>
        </button>

        {/* Event Title Header */}
        <div className="mb-6 pb-4 border-b border-border/60">
          <h2
            className="text-sm font-bold text-foreground truncate select-none cursor-default"
            title={event.name}
          >
            {event.name}
          </h2>
          <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-semibold">
            Gestión de Evento
          </p>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const toPath = `${basePath}/${item.to}`
            return (
              <NavLink
                key={item.to}
                to={toPath}
                className={({ isActive }) =>
                  cn(
                    "flex items-center justify-between py-2 text-sm transition-colors",
                    isActive
                      ? "text-primary font-bold"
                      : "text-muted-foreground hover:text-foreground font-medium"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span>{item.label}</span>
                    {counts[item.to] !== undefined && counts[item.to] > 0 && (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-normal transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {counts[item.to]}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>
      </aside>

      {/* Main Content Area - Shifted to the right by the fixed sidebar width on lg screens */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        <main className="container mx-auto py-12 px-6 flex-1 w-full">
          {/* Sheet / Drawer Navigation (Mobile & Tablet) */}
          <div className="lg:hidden w-full mb-6">
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full flex items-center justify-between px-4 py-2 h-10">
                  <span className="flex items-center gap-2">
                    <Menu className="size-4" />
                    <span>Navegación del Evento</span>
                  </span>
                  <span className="text-xs text-muted-foreground font-normal bg-muted px-2.5 py-0.5 rounded-full">
                    {activeLabel}
                  </span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-6 flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  {/* Volver Link */}
                  <button
                    onClick={() => {
                      setIsSheetOpen(false)
                      navigate("/dashboard/events")
                    }}
                    className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground group transition-colors self-start cursor-pointer"
                  >
                    <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-1" />
                    <span>Volver a Eventos</span>
                  </button>

                  <div className="pb-2 border-b border-border/60">
                    <h2
                      className="text-sm font-bold text-foreground truncate select-none cursor-default"
                      title={event.name}
                    >
                      {event.name}
                    </h2>
                    <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-semibold">
                      Gestión de Evento
                    </p>
                  </div>
                </div>

                <nav className="flex flex-col gap-1">
                  {NAV_ITEMS.map((item) => {
                    const toPath = `${basePath}/${item.to}`
                    return (
                      <NavLink
                        key={item.to}
                        to={toPath}
                        onClick={() => setIsSheetOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center justify-between py-2.5 text-sm transition-colors",
                            isActive
                              ? "text-primary font-bold"
                              : "text-muted-foreground hover:text-foreground font-medium"
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span>{item.label}</span>
                            {counts[item.to] !== undefined && counts[item.to] > 0 && (
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded-full font-normal transition-colors",
                                isActive
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                {counts[item.to]}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    )
                  })}
                </nav>
              </SheetContent>
            </Sheet>
          </div>

          {/* Main Outlet Area - "el cuerpo" with max-width limit */}
          <div className={cn(
            "w-full transition-all duration-300",
            isWidePage ? "max-w-[98%]" : ""
          )}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
