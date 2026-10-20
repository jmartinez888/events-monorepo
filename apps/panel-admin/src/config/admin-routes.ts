import { LayoutDashboard, Calendar, Settings2, User, Users, Award, Megaphone, Workflow, GitMerge } from "lucide-react"

export interface AdminRouteItem {
  title: string
  url: string
  icon?: any
  items?: {
    title: string
    url: string
  }[]
}

export const getAdminRoutes = (_locale?: string): AdminRouteItem[] => {
  return [
    {
      title: "Inicio",
      url: `/dashboard`,
      icon: LayoutDashboard,
    },
    {
      title: "Eventos",
      url: `/dashboard/events`,
      icon: Calendar,
    },
    {
      title: "Marketing",
      url: `/dashboard/campaigns`,
      icon: Megaphone,
      items: [
        { title: "Campañas", url: `/dashboard/campaigns` },
        { title: "Contactos", url: `/dashboard/campaigns/contacts` },
        { title: "Segmentos", url: `/dashboard/campaigns/segments` },
        { title: "Plantillas", url: `/dashboard/templates` },
      ],
    },
    { title: "Automatizaciones", url: `/dashboard/automations`, icon: Workflow },
    {
      title: "Perfiles Registrados",
      url: `/dashboard/profiles`,
      icon: Users,
    },
    {
      title: "Revisión de duplicados",
      url: `/dashboard/directory-reviews`,
      icon: GitMerge,
    },
    {
      title: "Mi Perfil",
      url: `/dashboard/profile`,
      icon: User,
    },
    {
      title: "Certificados",
      url: `/dashboard/certificates`,
      icon: Award,
    },
    {
      title: "Ajustes",
      url: `/dashboard/settings/business`,
      icon: Settings2,
    },
  ]
}
