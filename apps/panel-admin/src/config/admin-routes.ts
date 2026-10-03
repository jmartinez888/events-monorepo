import { LayoutDashboard, Calendar, Settings2, User, Users, Award, Mail, Megaphone } from "lucide-react"

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
      title: "Comisión (CNPP)",
      url: "/dashboard/commission",
      icon: Users, // Alternatively building or briefcase, but using Users to avoid new icon imports if missing
      items: [
        { title: "Instituciones", url: "/dashboard/commission/institutions" },
        { title: "Sesiones", url: "/dashboard/commission/sessions" },
        { title: "Acuerdos", url: "/dashboard/commission/agreements" },
      ]
    },
    {
      title: "Plantillas",
      url: `/dashboard/templates`,
      icon: Mail,
    },
    { title: "Marketing", url: `/dashboard/marketing`, icon: Megaphone },
    {
      title: "Perfiles Registrados",
      url: `/dashboard/profiles`,
      icon: Users,
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
