import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { api } from "@/api/client"
import { useAuthStore } from "@/store/auth.store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export function InstitutionsPage() {
  const { selectedOrganization } = useAuthStore()

  const { data: institutions, isLoading } = useQuery({
    queryKey: ["commission", "institutions", selectedOrganization?.id],
    queryFn: () => selectedOrganization ? api.commission.listInstitutions(selectedOrganization.id) : Promise.resolve([]),
    enabled: !!selectedOrganization,
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Instituciones Miembro</h1>
          <p className="text-muted-foreground mt-2">
            Gestione las instituciones que conforman la Comisión Nacional Permanente.
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all hover:scale-105 active:scale-95">
          <Plus className="mr-2 h-4 w-4" />
          Nueva Institución
        </Button>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg">Directorio Institucional</CardTitle>
          <CardDescription>
            Lista de entidades acreditadas ante la OTCA.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando instituciones...</div>
          ) : institutions?.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No hay instituciones registradas aún.</p>
              <Button variant="outline" className="mt-4">
                Registrar la primera
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {institutions?.map((inst) => (
                <div key={inst.id} className="p-6 flex items-center justify-between hover:bg-muted/10 transition-colors">
                  <div>
                    <h3 className="font-semibold text-lg">{inst.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{inst.acronym} - Titular: {inst.principalName}</p>
                  </div>
                  <Button variant="ghost" size="sm">Editar</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
