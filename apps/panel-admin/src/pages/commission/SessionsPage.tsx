import { useQuery } from "@tanstack/react-query"
import { Plus, CalendarDays } from "lucide-react"
import { api } from "@/api/client"
import { useAuthStore } from "@/store/auth.store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export function SessionsPage() {
  const { selectedOrganization } = useAuthStore()

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["commission", "sessions", selectedOrganization?.id],
    queryFn: () => selectedOrganization ? api.commission.listSessions(selectedOrganization.id) : Promise.resolve([]),
    enabled: !!selectedOrganization,
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <CalendarDays className="h-8 w-8 text-primary" />
            Sesiones de la Comisión
          </h1>
          <p className="text-muted-foreground mt-2">
            Programe y gestione las asambleas ordinarias y extraordinarias.
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all hover:scale-105 active:scale-95">
          <Plus className="mr-2 h-4 w-4" />
          Nueva Sesión
        </Button>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg">Registro de Sesiones</CardTitle>
          <CardDescription>
            Historial y próximas sesiones programadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando sesiones...</div>
          ) : sessions?.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No hay sesiones programadas aún.</p>
              <Button variant="outline" className="mt-4">
                Programar primera sesión
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {sessions?.map((session) => (
                <div key={session.id} className="p-6 flex items-center justify-between hover:bg-muted/10 transition-colors">
                  <div>
                    <h3 className="font-semibold text-lg">{session.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {new Date(session.scheduledDate).toLocaleDateString()} - {session.startTime} | Tipo: {session.type}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm">Ver Detalles</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
