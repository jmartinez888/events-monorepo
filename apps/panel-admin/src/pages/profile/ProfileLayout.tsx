import { useEffect } from "react"
import { useNavigate, NavLink, Outlet } from "react-router-dom"
import { useAuthStore } from "@/store/auth.store"
import { useProfileStore } from "@/store/profile.store"
import { ThemeSwitch } from "@/components/ui/theme-switch"
import { ZynqroLogo } from "@/components/zynqro-logo"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ChevronsUpDown, LogOut } from "lucide-react"
import { PageHeader } from "@/components/page-header"

export function ProfileLayout() {
  const navigate = useNavigate()
  const { user, logout, selectedOrganization } = useAuthStore()
  const { loadProfileData } = useProfileStore()

  useEffect(() => {
    if (user?.id) {
      loadProfileData(user.id)
    }
  }, [user?.id, loadProfileData])

  const handleLogout = async () => {
    localStorage.removeItem("events-api-access-token")
    localStorage.removeItem("events-api-refresh-token")
    logout()
    navigate("/login", { replace: true })
  }

  const handleBack = () => {
    if (selectedOrganization) {
      navigate("/dashboard")
    } else {
      navigate("/dashboard/organizations")
    }
  }

  const navItems = [
    { to: "info", label: "Datos Generales" },
    { to: "experience", label: "Experiencia Profesional" },
    { to: "education", label: "Estudios" },
    { to: "certifications", label: "Certificaciones" },
    { to: "talks", label: "Mis ponencias" },
    { to: "security", label: "Seguridad" },
  ]

  const getLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors shrink-0 ${isActive
      ? "border-primary text-primary font-bold"
      : "border-transparent text-muted-foreground hover:text-foreground"
    }`

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      {/* Top Header Navbar */}
      <header className="h-16 bg-card border-b border-border flex items-center justify-between px-8 flex-shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <ZynqroLogo className="h-8 w-auto ml-2" />
        </div>

        <div className="flex items-center gap-6 text-sm">
          <ThemeSwitch />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 outline-none p-1.5 rounded-lg hover:bg-muted transition-colors border border-transparent hover:border-border cursor-pointer">
                <Avatar className="h-8 w-8 rounded-lg border border-border">
                  <AvatarImage
                    src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                      user?.full_name || user?.email || "E"
                    )}`}
                    alt={user?.full_name || ""}
                  />
                  <AvatarFallback className="rounded-lg">US</AvatarFallback>
                </Avatar>
                <div className="hidden md:grid text-left text-xs leading-tight">
                  <span className="truncate font-semibold text-sm text-foreground">
                    {user?.full_name || "Usuario"}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
                <ChevronsUpDown className="ml-1 size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" sideOffset={4}>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg border border-border">
                    <AvatarImage
                      src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                        user?.full_name || user?.email || "E"
                      )}`}
                      alt={user?.full_name || ""}
                    />
                    <AvatarFallback className="rounded-lg">US</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user?.full_name || "Usuario"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="gap-2 p-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="size-4" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Settings Form Container */}
      <main className="max-w-4xl mx-auto px-6 py-12 flex-1 w-full">
        <PageHeader
          title="Mi Perfil"
          description="Actualiza tus datos personales"
          showBackButton
          onBackClick={handleBack}
        />

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto select-none no-scrollbar mb-8">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={getLinkClass}
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Routable Outlet */}
        <div className="mt-4">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
