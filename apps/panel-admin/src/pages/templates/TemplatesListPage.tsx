import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  Plus,
  Search,
  Copy,
  Trash2,
  Edit,
  SlidersHorizontal,
  MoreVertical,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api/client"
import { useAuthStore } from "@/store/auth.store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/page-header"
import { useSEO } from "@/hooks/use-seo"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { ShieldCheck, Settings } from "lucide-react"

const MAIL_SETTINGS_URL = "/dashboard/settings/integrations?section=mail"

export function TemplatesListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { selectedOrganization } = useAuthStore()

  useSEO({
    title: "Plantillas de Email",
    description: "Crea, personaliza y gestiona las plantillas de correo para tus campañas y notificaciones.",
  })

  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const currentScope = (searchParams.get("scope") as "library" | "campaigns") || "library"
  const templateScope = currentScope === "campaigns" ? "campaigns" : "library"

  const setTemplateScope = (scope: "library" | "campaigns") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("scope", scope)
      return next
    })
  }

  const [emailConfigSummary, setEmailConfigSummary] = useState<{ configured: boolean; provider?: string; domain?: string } | null>(null)

  // Delete dialog
  const [templateToDelete, setTemplateToDelete] = useState<any | null>(null)

  const loadEmailSettings = async () => {
    if (!selectedOrganization?.id) return
    try {
      const data = await api.emailSettings.get(selectedOrganization.id)
      setEmailConfigSummary({
        configured: data.configured,
        provider: data.defaultProvider,
        domain: data.resendDomain || (data.resendFromEmail?.includes('@') ? data.resendFromEmail.split('@')[1] : undefined),
      })
    } catch {
      // ignore
    }
  }

  const loadTemplates = async () => {
    if (!selectedOrganization?.id) return
    try {
      setLoading(true)
      const data = await api.emailTemplates.list(selectedOrganization.id, search)
      setTemplates(data)
    } catch (err: any) {
      toast.error(err?.message || "Error al cargar las plantillas.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
    loadEmailSettings()
  }, [selectedOrganization?.id, search])

  const handleDuplicate = async (id: string) => {
    try {
      await api.emailTemplates.duplicate(id)
      toast.success("Plantilla duplicada con éxito.")
      loadTemplates()
    } catch (err: any) {
      toast.error(err?.message || "No se pudo duplicar la plantilla.")
    }
  }

  const handleDelete = async () => {
    if (!templateToDelete) return
    try {
      await api.emailTemplates.remove(templateToDelete.id)
      toast.success("Plantilla eliminada correctamente.")
      setTemplateToDelete(null)
      loadTemplates()
    } catch (err: any) {
      toast.error(err?.message || "Error al eliminar la plantilla.")
    }
  }

  const libraryTemplates = templates.filter((template) => !template.sourceTemplateId && !template.tags?.includes("campaign-copy"))
  const campaignTemplates = templates.filter((template) => Boolean(template.sourceTemplateId) || template.tags?.includes("campaign-copy"))
  const filteredTemplates = (templateScope === "library" ? libraryTemplates : campaignTemplates).filter((template) =>
    template.name?.toLowerCase().includes(search.toLowerCase()) ||
    template.subject?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 container mx-auto">
      {/* Page Header */}
      <PageHeader
        title="Plantillas de Email"
        description="Crea, personaliza y gestiona las plantillas de correo para tus campañas y notificaciones."
        actionButton={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              onClick={() => navigate(MAIL_SETTINGS_URL)}
              className="rounded-xl h-10 px-3.5 text-xs font-semibold border-border flex items-center gap-2 hover:bg-muted"
            >
              <ShieldCheck className="size-4 text-emerald-600" />
              <span>Configuración de Correo</span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground">
                {emailConfigSummary?.configured ? "Configurado" : "Pendiente"}
              </span>
            </Button>

            <Button
              onClick={() => {
                if (!emailConfigSummary?.configured) {
                  toast.error("Primero configura el correo de tu institución en Integraciones.")
                  navigate(MAIL_SETTINGS_URL)
                  return
                }
                navigate("/dashboard/templates/new")
              }}
              className="flex items-center gap-2 rounded-xl h-10"
            >
              <Plus className="size-4" />
              <span>Crear plantilla</span>
            </Button>
          </div>
        }
      />

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTemplateScope("library")}
          className={`border-b-2 px-3 py-2 text-sm transition-colors ${templateScope === "library" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Plantillas base <span className="ml-1 text-xs text-muted-foreground">{libraryTemplates.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setTemplateScope("campaigns")}
          className={`border-b-2 px-3 py-2 text-sm transition-colors ${templateScope === "campaigns" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Copias de campañas <span className="ml-1 text-xs text-muted-foreground">{campaignTemplates.length}</span>
        </button>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={templateScope === "library" ? "Buscar una plantilla..." : "Buscar una copia de campaña..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background rounded-xl h-10 border-border text-xs"
          />
        </div>

        <div className="text-xs text-muted-foreground font-medium">
          {filteredTemplates.length} {filteredTemplates.length === 1 ? "plantilla" : "plantillas"}
        </div>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-48 rounded-2xl border bg-card/50 animate-pulse p-6 space-y-4" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border/80 bg-card/40 p-10 text-center max-w-xl mx-auto space-y-5 my-6">
          <img
            src="/svg/empty_plantillas.svg"
            alt="Sin plantillas"
            className="w-56 max-h-48 mx-auto object-contain"
          />
          <div>
            <h3 className="text-lg font-bold text-foreground">No tienes plantillas de email guardadas</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {templateScope === "library" ? "Crea tu primera plantilla de correo electrónico profesional o elige una de nuestras plantillas básicas." : "Las copias se crean al elegir una plantilla para una campaña. Cada una conserva sus cambios de forma independiente."}
            </p>
          </div>
          {templateScope === "library" && <Button
            onClick={() => {
              if (!emailConfigSummary?.configured) {
                toast.error("Primero configura el correo de tu institución en Integraciones.")
                navigate(MAIL_SETTINGS_URL)
                return
              }
              navigate("/dashboard/templates/new")
            }}
            className="flex items-center gap-2 mx-auto cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Crear primera plantilla</span>
          </Button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTemplates.map((template) => {
            const isActive = template.status === "ACTIVE"
            const isDraft = template.status === "DRAFT"

            return (
              <div
                key={template.id}
                className="group relative rounded-2xl border border-border bg-card p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between hover:border-primary/40"
              >
                <div>
                  {/* Top Status & Dropdown */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        isActive
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : isDraft
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-slate-500/10 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          isActive ? "bg-emerald-500" : isDraft ? "bg-amber-500" : "bg-slate-400"
                        }`}
                      />
                      {isActive ? "Activa" : isDraft ? "Borrador" : "Inactiva"}
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted cursor-pointer">
                          <MoreVertical className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl w-40">
                        <DropdownMenuItem
                          onClick={() => navigate(`/dashboard/templates/${template.id}/edit?scope=${templateScope}`)}
                          className="cursor-pointer text-xs flex items-center gap-2"
                        >
                          <Edit className="size-3.5" />
                          <span>Editar datos</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => navigate(`/dashboard/templates/${template.id}/builder?scope=${templateScope}`)}
                          className="cursor-pointer text-xs flex items-center gap-2"
                        >
                          <SlidersHorizontal className="size-3.5" />
                          <span>Diseñar email</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDuplicate(template.id)}
                          className="cursor-pointer text-xs flex items-center gap-2"
                        >
                          <Copy className="size-3.5" />
                          <span>Duplicar</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setTemplateToDelete(template)}
                          className="cursor-pointer text-xs text-destructive flex items-center gap-2"
                        >
                          <Trash2 className="size-3.5" />
                          <span>Eliminar</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Title & Subject */}
                  <h3
                    onClick={() => navigate(`/dashboard/templates/${template.id}/edit?scope=${templateScope}`)}
                    className="font-bold text-base text-foreground group-hover:text-primary transition-colors line-clamp-1 cursor-pointer"
                  >
                    {template.name}
                  </h3>

                  {templateScope === "campaigns" && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Copia privada de una campaña</p>
                  )}

                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {template.subject || "Sin asunto definido"}
                  </p>

                  {template.senderEmail && (
                    <div className="mt-3">
                      <Badge variant="outline" className="text-[11px] font-normal border-primary/20 text-primary">
                        De: {template.senderName || "Remitente"} &lt;{template.senderEmail}&gt;
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    Modificado: {new Date(template.updatedAt).toLocaleDateString()}
                  </span>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/templates/${template.id}/edit?scope=${templateScope}`)}
                      className="rounded-lg h-8 text-xs font-medium cursor-pointer"
                    >
                      <Edit className="mr-1 size-3.5" />
                      Configurar
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => navigate(`/dashboard/templates/${template.id}/builder?scope=${templateScope}`)}
                      className="rounded-lg h-8 text-xs font-semibold cursor-pointer"
                    >
                      <SlidersHorizontal className="mr-1.5 size-3.5" />
                      Diseñar
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plantilla de email?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la plantilla "{templateToDelete?.name}" y todo su contenido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}

