import { useEffect } from "react"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { useAuthStore } from "@/store/auth.store"
import { LoginForm } from "@/components/login-form"
import { ZynqroLogo } from "@/components/zynqro-logo"

import { useSEO } from "@/hooks/use-seo"

export function LoginPage() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  useSEO({
    title: "Iniciar Sesión",
    description: "Inicia sesión en tu cuenta de Zynqro  para administrar tus organizaciones y eventos."
  })

  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as any)?.from?.pathname || "/dashboard"
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, navigate, location])

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row text-foreground">
      {/* Left side: LoginForm and header branding */}
      <div className="flex-1 flex flex-col justify-between p-8 md:p-12 lg:p-16 max-w-xl mx-auto w-full">
        {/* Top Header Branding */}
        <div>
          <Link to="/dashboard" className="w-fit block">
            <ZynqroLogo className="h-10 w-auto" />
          </Link>
        </div>

        {/* Form Container */}
        <div className="my-auto py-8">
          <LoginForm key={location.pathname} className="w-full max-w-sm mx-auto" initialMode={location.pathname === "/register" ? "register" : "login"} />
        </div>

        {/* Footer info */}
        <div className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Zynqro. Todos los derechos reservados.
        </div>
      </div>

      {/* Right side: Image banner */}
      <div className="hidden md:block flex-1 relative bg-muted overflow-hidden">
        <img
          src="/images/login-banner.png"
          alt="Event Management"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-neutral-900/40 mix-blend-multiply pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
          <blockquote className="space-y-2 relative z-10">
            <p className="text-sm font-medium leading-relaxed max-w-xl text-gray-400">
              "Zynqro ha transformado por completo la manera en que planificamos y ejecutamos nuestros congresos y conferencias. Administrar ponentes, cronogramas y registros ahora es un proceso fluido e impecable."
            </p>
          </blockquote>
        </div>
      </div>
    </div>
  )
}
