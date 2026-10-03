import { useQuery } from "@tanstack/react-query"
import { ClipboardCheck } from "lucide-react"
import { api } from "@/api/client"
import { useAuthStore } from "@/store/auth.store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export function AgreementsPage() {
  const { selectedOrganization } = useAuthStore()

  const { data: stats } = useQuery({
    queryKey: ["commission", "agreements", "stats", selectedOrganization?.id],
    queryFn: () => selectedOrganization ? api.commission.stats(selectedOrganization.id) : Promise.resolve(null),
    enabled: !!selectedOrganization,
  })

  const { data: agreements, isLoading } = useQuery({
    queryKey: ["commission", "agreements", selectedOrganization?.id],
    queryFn: () => selectedOrganization ? api.commission.listAgreements(selectedOrganization.id) : Promise.resolve([]),
    enabled: !!selectedOrganization,
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <ClipboardCheck className="h-8 w-8 text-primary" />
            Acuerdos y Seguimiento
          </h1>
          <p className="text-muted-foreground mt-2">
            Monitoree el cumplimiento de los acuerdos tomados en sesión.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="py-4">
            <CardTitle className="text-primary text-sm uppercase tracking-wider">Total Acuerdos</CardTitle>
            <div className="text-3xl font-bold">{stats?.total || 0}</div>
          </CardHeader>
        </Card>
        <Card className="bg-green-500/5 border-green-500/20">
          <CardHeader className="py-4">
            <CardTitle className="text-green-600 text-sm uppercase tracking-wider">Cumplidos</CardTitle>
            <div className="text-3xl font-bold text-green-600">{stats?.fulfilled || 0}</div>
          </CardHeader>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardHeader className="py-4">
            <CardTitle className="text-blue-600 text-sm uppercase tracking-wider">En Progreso</CardTitle>
            <div className="text-3xl font-bold text-blue-600">{stats?.inProgress || 0}</div>
          </CardHeader>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardHeader className="py-4">
            <CardTitle className="text-red-600 text-sm uppercase tracking-wider">Vencidos</CardTitle>
            <div className="text-3xl font-bold text-red-600">{stats?.overdue || 0}</div>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg">Lista de Acuerdos</CardTitle>
          <CardDescription>
            Mostrando todos los acuerdos registrados.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando acuerdos...</div>
          ) : agreements?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No hay acuerdos registrados. Los acuerdos se crean desde el detalle de cada sesión.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {agreements?.map((agreement) => (
                <div key={agreement.id} className="p-6 flex items-center justify-between hover:bg-muted/10 transition-colors">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted border">
                        {agreement.agreementCode}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${agreement.status === 'FULFILLED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                        {agreement.status}
                      </span>
                    </div>
                    <h3 className="font-medium">{agreement.description}</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Responsable: {agreement.institution?.name} | Vence: {new Date(agreement.deadline).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
