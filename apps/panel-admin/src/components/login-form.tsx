import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { z } from "zod"
import { useAuthStore } from "@/store/auth.store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api, ApiError, storeSessionTokens, type LoginOutcome } from "@/api/client"
import { Eye, EyeOff, KeyRound, MailCheck, ShieldCheck } from "lucide-react"

const loginSchema = z.object({
  email: z.string().min(1, "El correo electrónico es requerido").email("Correo electrónico inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
})
const registerSchema = z.object({
  firstName: z.string().trim().min(1, "Ingresa tus nombres"),
  lastName: z.string().trim().min(1, "Ingresa tus apellidos"),
  email: z.string().min(1, "El correo electrónico es requerido").email("Correo electrónico inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres").regex(/[A-Za-z]/, "Incluye letras").regex(/\d/, "Incluye números"),
})

type Mode = "login" | "forgot" | "register" | "code"
type PendingStep = { kind: "verify" | "mfa"; pendingToken: string; email: string; method?: "TOTP" | "EMAIL" }

const errorBox = "p-3 text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-md text-center"
const okBox = "p-3 text-xs font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-center"
const linkButton = "w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors mt-2 cursor-pointer bg-transparent border-0 outline-none"

export function LoginForm({ className, initialMode = "login", ...props }: React.ComponentProps<"form"> & { initialMode?: "login" | "register" }) {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const setLoading = useAuthStore((state) => state.setLoading)

  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [code, setCode] = useState("")
  const [useRecovery, setUseRecovery] = useState(false)
  const [pending, setPending] = useState<PendingStep | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const switchMode = (next: Mode) => {
    setMode(next)
    setErrors({})
    setFormError(null)
    setSuccessMessage(null)
    setCode("")
    setUseRecovery(false)
  }

  /** Sesión abierta: guarda tokens, carga organizaciones y entra al panel. */
  const finishLogin = async (outcome: Extract<LoginOutcome, { status: "OK" }>) => {
    storeSessionTokens(outcome)
    const sessionUser = outcome.user
    const orgsData = await api.organizations.list()
    const formattedOrgs = (orgsData || []).map((org: any) => ({
      id: org.id,
      name: org.name,
      slug: org.slug || org.name.toLowerCase().replace(/\s+/g, "-"),
      description: org.description || "",
      isActive: true,
      type: "organization",
      logoUrl: org.logoUrl || "",
      coverUrl: org.coverUrl || "",
      faviconUrl: "",
      plan: "Free Plan",
      projectsCount: 0,
    }))
    const fullName = sessionUser.firstName || sessionUser.lastName ? `${sessionUser.firstName || ""} ${sessionUser.lastName || ""}`.trim() : sessionUser.fullName || null
    login({ id: sessionUser.id, email: sessionUser.email || email, full_name: fullName, phone: sessionUser.phone || null, bio: sessionUser.bio || null, specialty: sessionUser.specialty || null, role: sessionUser.role || "USER" }, formattedOrgs)
    navigate(["SUPER_ADMIN", "SAAS_ADMIN"].includes(sessionUser.role) ? "/admin" : "/dashboard/organizations", { replace: true })
  }

  /** Cada respuesta de acceso decide el siguiente paso. */
  const handleOutcome = async (outcome: LoginOutcome) => {
    if (outcome.status === "OK") return finishLogin(outcome)
    setPending({ kind: outcome.status === "VERIFY_EMAIL" ? "verify" : "mfa", pendingToken: outcome.pendingToken, email: outcome.email, method: outcome.status === "MFA_REQUIRED" ? outcome.method : undefined })
    setCode("")
    setUseRecovery(false)
    setFormError(null)
    setSuccessMessage(null)
    setMode("code")
  }

  const run = async (action: () => Promise<void>) => {
    setFormError(null)
    setIsLoading(true)
    setLoading(true)
    try {
      await action()
    } catch (err) {
      if (err instanceof ApiError && err.code === "PENDING_EXPIRED") {
        switchMode("login")
        setFormError(err.message)
      } else setFormError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado. Inténtalo de nuevo.")
    } finally {
      setIsLoading(false)
      setLoading(false)
    }
  }

  const validate = <T,>(schema: z.ZodType<T>, data: unknown) => {
    const result = schema.safeParse(data)
    if (result.success) { setErrors({}); return true }
    const fieldErrors: Record<string, string> = {}
    for (const issue of result.error.issues) if (issue.path[0] && !fieldErrors[String(issue.path[0])]) fieldErrors[String(issue.path[0])] = issue.message
    setErrors(fieldErrors)
    return false
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate(loginSchema, { email, password })) return
    void run(async () => handleOutcome(await api.auth.login(email, password)))
  }

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate(registerSchema, { firstName, lastName, email, password })) return
    void run(async () => handleOutcome(await api.auth.register({ email, password, firstName, lastName })))
  }

  const handleCode = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pending) return
    const clean = code.trim()
    if (!useRecovery && !/^\d{6}$/.test(clean.replace(/\s+/g, ""))) { setErrors({ code: "El código tiene 6 dígitos" }); return }
    setErrors({})
    void run(async () => handleOutcome(pending.kind === "verify" ? await api.auth.verifyEmail(pending.pendingToken, clean) : await api.auth.completeTwoFactor(pending.pendingToken, clean)))
  }

  const handleResend = () => {
    if (!pending) return
    void run(async () => {
      const result = await api.auth.resendCode(pending.pendingToken)
      setSuccessMessage(`Te enviamos un código nuevo. Vence en ${result.expiresInMinutes} minutos.`)
    })
  }

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setErrors({ email: "El correo electrónico es requerido" }); return }
    void run(async () => {
      await api.auth.forgotPassword(email)
      setSuccessMessage("Si el correo existe, recibirás instrucciones para restablecer tu contraseña.")
    })
  }

  const header = (title: string, text: string, icon?: React.ReactNode) => (
    <div className="flex flex-col items-center gap-1 text-center">
      {icon ? <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div> : null}
      <h1 className="text-2xl font-bold font-sans">{title}</h1>
      <p className="text-sm text-balance text-muted-foreground font-sans">{text}</p>
    </div>
  )
  const messages = (
    <>
      {formError && <div role="alert" className={errorBox}>{formError}</div>}
      {successMessage && <div role="status" className={okBox}>{successMessage}</div>}
    </>
  )
  const emailField = (
    <Field>
      <FieldLabel htmlFor="email">Correo Electrónico</FieldLabel>
      <Input id="email" type="email" autoComplete="email" placeholder="m@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={cn("bg-background", errors.email && "border-destructive")} />
      {errors.email && <p className="text-xs text-destructive mt-1 font-semibold">{errors.email}</p>}
    </Field>
  )
  const passwordInput = (autoComplete: string) => (
    <div className="relative flex items-center">
      <Input id="password" type={showPassword ? "text" : "password"} autoComplete={autoComplete} value={password} onChange={(e) => setPassword(e.target.value)} className={cn("bg-background pr-10", errors.password && "border-destructive")} />
      <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors outline-none focus:outline-none">
        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )

  if (mode === "code" && pending) {
    const isVerify = pending.kind === "verify"
    const viaEmail = isVerify || pending.method === "EMAIL"
    return (
      <form onSubmit={handleCode} className={cn("flex flex-col gap-6", className)} {...props}>
        <FieldGroup>
          {header(
            isVerify ? "Verifica tu correo" : "Verificación en dos pasos",
            useRecovery ? "Ingresa uno de tus códigos de recuperación (XXXXX-XXXXX). Cada uno sirve una sola vez." : viaEmail ? `Enviamos un código de 6 dígitos a ${pending.email}.` : "Ingresa el código de 6 dígitos de tu app autenticadora.",
            isVerify ? <MailCheck className="size-5" /> : <ShieldCheck className="size-5" />,
          )}
          {messages}
          <Field>
            <FieldLabel htmlFor="code">{useRecovery ? "Código de recuperación" : "Código"}</FieldLabel>
            <Input id="code" autoFocus autoComplete="one-time-code" inputMode={useRecovery ? "text" : "numeric"} maxLength={useRecovery ? 11 : 7} placeholder={useRecovery ? "XXXXX-XXXXX" : "123456"} value={code} onChange={(e) => setCode(e.target.value)} className={cn("bg-background text-center font-mono text-lg tracking-[0.4em]", errors.code && "border-destructive")} />
            {errors.code && <p className="text-xs text-destructive mt-1 font-semibold">{errors.code}</p>}
          </Field>
          <Field>
            <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? "Verificando..." : isVerify ? "Verificar correo" : "Continuar"}</Button>
          </Field>
          <Field>
            {viaEmail && !useRecovery ? <button type="button" onClick={handleResend} disabled={isLoading} className={linkButton}>Reenviar código</button> : null}
            {!isVerify ? <button type="button" onClick={() => { setUseRecovery(!useRecovery); setCode(""); setErrors({}) }} className={linkButton}>{useRecovery ? "Usar el código de 6 dígitos" : "No tengo acceso: usar un código de recuperación"}</button> : null}
            <button type="button" onClick={() => switchMode("login")} className={linkButton}>Volver a Iniciar Sesión</button>
          </Field>
        </FieldGroup>
      </form>
    )
  }

  if (mode === "forgot") {
    return (
      <form onSubmit={handleForgotPassword} className={cn("flex flex-col gap-6", className)} {...props}>
        <FieldGroup>
          {header("Recuperar Contraseña", "Ingresa tu correo para recibir instrucciones de restauración.", <KeyRound className="size-5" />)}
          {messages}
          {emailField}
          <Field><Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? "Enviando..." : "Enviar Instrucciones"}</Button></Field>
          <Field><button type="button" onClick={() => switchMode("login")} className={linkButton}>Volver a Iniciar Sesión</button></Field>
        </FieldGroup>
      </form>
    )
  }

  if (mode === "register") {
    return (
      <form onSubmit={handleRegister} className={cn("flex flex-col gap-6", className)} {...props}>
        <FieldGroup>
          {header("Crear cuenta", "Te enviaremos un código para verificar tu correo. La cuenta no tiene permisos hasta que un administrador te asigne a una organización.")}
          {messages}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="firstName">Nombres</FieldLabel>
              <Input id="firstName" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={cn("bg-background", errors.firstName && "border-destructive")} />
              {errors.firstName && <p className="text-xs text-destructive mt-1 font-semibold">{errors.firstName}</p>}
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Apellidos</FieldLabel>
              <Input id="lastName" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={cn("bg-background", errors.lastName && "border-destructive")} />
              {errors.lastName && <p className="text-xs text-destructive mt-1 font-semibold">{errors.lastName}</p>}
            </Field>
          </div>
          {emailField}
          <Field>
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            {passwordInput("new-password")}
            {errors.password ? <p className="text-xs text-destructive mt-1 font-semibold">{errors.password}</p> : <FieldDescription className="text-xs">Mínimo 8 caracteres, con letras y números.</FieldDescription>}
          </Field>
          <Field><Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? "Creando cuenta..." : "Crear cuenta"}</Button></Field>
          <Field><button type="button" onClick={() => switchMode("login")} className={linkButton}>¿Ya tienes cuenta? Inicia sesión</button></Field>
        </FieldGroup>
      </form>
    )
  }

  return (
    <form onSubmit={handleLogin} className={cn("flex flex-col gap-6", className)} {...props}>
      <FieldGroup>
        {header("Iniciar Sesión", "Ingresa tu correo para acceder a tu cuenta")}
        {messages}
        {emailField}
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            <button type="button" onClick={() => switchMode("forgot")} className="ml-auto text-xs underline-offset-4 hover:underline text-muted-foreground cursor-pointer bg-transparent border-0 outline-none">¿Olvidaste tu contraseña?</button>
          </div>
          {passwordInput("current-password")}
          {errors.password && <p className="text-xs text-destructive mt-1 font-semibold">{errors.password}</p>}
        </Field>
        <Field><Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? "Validando..." : "Ingresar"}</Button></Field>
        <Field>
          <FieldDescription className="text-center mt-2 text-xs">
            ¿No tienes una cuenta?{" "}
            <button type="button" onClick={() => switchMode("register")} className="underline underline-offset-4 font-semibold text-primary bg-transparent border-0 cursor-pointer">Regístrate</button>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
