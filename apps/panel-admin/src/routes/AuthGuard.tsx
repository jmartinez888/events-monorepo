import { Navigate, useLocation } from "react-router-dom"
import { useAuthStore } from "../store/auth.store"
import type { UserRole } from "../types/auth.types"

interface AuthGuardProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
  requireSelectedOrganization?: boolean
}

export function AuthGuard({
  children,
  allowedRoles,
  requireSelectedOrganization = true,
}: AuthGuardProps) {
  const { isAuthenticated, user, selectedOrganization, isLoading } = useAuthStore()
  const location = useLocation()

  // Show a premium workspace layout skeleton while checking auth session
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen bg-background overflow-hidden text-foreground">
        {/* Sidebar Skeleton */}
        <div className="w-[270px] bg-card border-r border-border hidden md:flex flex-col p-6 space-y-6 shrink-0 animate-pulse">
          <div className="h-8 w-32 bg-muted rounded-md" />
          <div className="space-y-3 flex-1 pt-6">
            <div className="h-10 w-full bg-muted rounded-md" />
            <div className="h-10 w-full bg-muted rounded-md" />
            <div className="h-10 w-full bg-muted rounded-md" />
          </div>
          <div className="h-12 w-full bg-muted rounded-lg" />
        </div>

        {/* Content Area Skeleton */}
        <div className="flex flex-col flex-1 h-full overflow-hidden">
          {/* Header Skeleton */}
          <div className="h-16 bg-card border-b border-border flex items-center justify-between px-8 flex-shrink-0 animate-pulse">
            <div className="h-5 w-32 bg-muted rounded-md" />
            <div className="h-8 w-24 bg-muted rounded-md" />
          </div>
          
          {/* Main Area Skeleton */}
          <div className="flex-1 p-8 space-y-8 animate-pulse bg-muted/5">
            <div className="space-y-2">
              <div className="h-8 w-48 bg-muted rounded-md" />
              <div className="h-4 w-72 bg-muted rounded-md" />
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-6 h-[140px] flex items-start gap-4">
                  <div className="size-10 bg-muted rounded-lg shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                    <div className="h-3 bg-muted/60 rounded w-3/4 mt-2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 1. If not logged in, redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const isGlobalAdmin = ["SUPER_ADMIN", "SAAS_ADMIN"].includes(user.role)
  const isAdminArea = location.pathname === "/admin" || location.pathname.startsWith("/admin/")

  // El administrador global también entra al panel de una institución (crear, gestionar eventos);
  // /admin queda para la administración de la plataforma.
  if (!isGlobalAdmin && isAdminArea) {
    return <Navigate to="/dashboard/organizations" replace />
  }

  // 2. Redirect to organization selection if none chosen (and they are not already navigating to it)
  if (
    requireSelectedOrganization &&
    !selectedOrganization &&
    location.pathname !== "/dashboard/organizations"
  ) {
    return <Navigate to="/dashboard/organizations" replace />
  }

  // 3. Check role restrictions if applicable
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
