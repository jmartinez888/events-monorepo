import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import { toast } from "sonner"
import { Copy, KeyRound, LogOut, Mail, ShieldCheck, ShieldOff, Smartphone } from "lucide-react"
import { api, ApiError, storeSessionTokens, type AccountSecurity } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"

type Setup = { method: "TOTP"; secret: string; qr: string } | { method: "EMAIL"; email: string } | null

const ACTIONS: Record<string, string> = {
  login: "Inicio de sesión",
  login_failed: "Intento fallido de acceso",
  registered: "Cuenta creada",
  email_verified: "Correo verificado",
  two_factor_enabled: "2FA activado",
  two_factor_disabled: "2FA desactivado",
  two_factor_passed: "Segundo factor correcto",
  two_factor_failed: "Segundo factor incorrecto",
  two_factor_recovery_used: "Código de recuperación usado",
  two_factor_reset_by_admin: "2FA retirado por un administrador",
  recovery_codes_regenerated: "Códigos de recuperación regenerados",
  password_changed: "Contraseña cambiada",
  password_reset: "Contraseña restablecida",
  sessions_revoked: "Sesiones cerradas",
}

const message = (error: unknown) => (error instanceof ApiError ? error.message : "No se pudo completar la operación.")

/** Seguridad de la cuenta: el segundo factor es opcional para todas las cuentas, incluido SUPER_ADMIN. */
export function ProfileSecuritySection() {
  const [account, setAccount] = useState<AccountSecurity | null>(null)
  const [events, setEvents] = useState<Array<{ id: string; action: string; ip: string | null; createdAt: string }>>([])
  const [setup, setSetup] = useState<Setup>(null)
  const [code, setCode] = useState("")
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [password, setPassword] = useState("")
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [me, log] = await Promise.all([api.auth.me(), api.auth.securityEvents()])
      setAccount(me)
      setEvents(log)
    } catch (error) {
      toast.error(message(error))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try { await action() } catch (error) { toast.error(message(error)) } finally { setBusy(false) }
  }

  const startTotp = () => run(async () => {
    const result = await api.auth.beginTotp()
    setSetup({ method: "TOTP", secret: result.secret, qr: await QRCode.toDataURL(result.otpauthUri, { margin: 1, width: 220 }) })
    setCode("")
  })
  const startEmail = () => run(async () => {
    const result = await api.auth.beginEmailTwoFactor()
    setSetup({ method: "EMAIL", email: result.email })
    setCode("")
    toast.success(`Enviamos un código a ${result.email}`)
  })
  const confirmSetup = () => run(async () => {
    if (!setup) return
    const result = setup.method === "TOTP" ? await api.auth.enableTotp(code) : await api.auth.enableEmailTwoFactor(code)
    // Activar el 2FA cierra las demás sesiones; esta continúa con los tokens nuevos.
    storeSessionTokens(result)
    setRecoveryCodes(result.recoveryCodes)
    setSetup(null)
    setCode("")
    toast.success("Verificación en dos pasos activada")
    await load()
  })
  const disable = () => run(async () => {
    const result = await api.auth.disableTwoFactor(password)
    storeSessionTokens(result)
    setPassword("")
    setRecoveryCodes(null)
    toast.success("Verificación en dos pasos desactivada")
    await load()
  })
  const regenerate = () => run(async () => {
    const result = await api.auth.regenerateRecoveryCodes(password)
    setPassword("")
    setRecoveryCodes(result.recoveryCodes)
    await load()
  })
  const changePassword = () => run(async () => {
    if (next.length < 8) throw new ApiError(400, "La nueva contraseña debe tener al menos 8 caracteres")
    storeSessionTokens(await api.auth.changePassword(current, next))
    setCurrent("")
    setNext("")
    toast.success("Contraseña actualizada. Las demás sesiones se cerraron.")
    await load()
  })
  const logoutAll = () => run(async () => {
    await api.auth.logoutAll()
    toast.success("Las sesiones en otros dispositivos se cerrarán al expirar su acceso (máx. 15 min).")
    await load()
  })

  if (!account) return <p className="text-sm text-muted-foreground">Cargando seguridad de la cuenta…</p>

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="border-b border-border pb-3">
        <h3 className="text-lg font-bold">Seguridad</h3>
        <p className="text-xs text-muted-foreground">Correo verificado, verificación en dos pasos y sesiones de {account.email}.</p>
      </div>

      <section className="rounded-xl border border-border p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {account.twoFactorEnabled ? <ShieldCheck className="size-5 text-emerald-600" /> : <ShieldOff className="size-5 text-muted-foreground" />}
            <div>
              <p className="font-semibold text-sm">Verificación en dos pasos</p>
              <p className="text-xs text-muted-foreground">Opcional. Además de la contraseña, pide un código al iniciar sesión.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={account.emailVerified ? "secondary" : "destructive"}>{account.emailVerified ? "Correo verificado" : "Correo sin verificar"}</Badge>
            <Badge variant={account.twoFactorEnabled ? "default" : "outline"}>{account.twoFactorEnabled ? (account.twoFactorMethod === "TOTP" ? "Activo · app autenticadora" : "Activo · código por correo") : "Desactivado"}</Badge>
          </div>
        </div>

        {!account.twoFactorEnabled && !setup ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" disabled={busy} onClick={startTotp} className="text-left rounded-lg border border-border p-4 hover:border-primary transition-colors disabled:opacity-60">
              <Smartphone className="size-5 text-primary mb-2" />
              <p className="font-semibold text-sm">App autenticadora</p>
              <p className="text-xs text-muted-foreground">Google Authenticator, Microsoft Authenticator, Authy o 1Password. Funciona sin conexión.</p>
            </button>
            <button type="button" disabled={busy} onClick={startEmail} className="text-left rounded-lg border border-border p-4 hover:border-primary transition-colors disabled:opacity-60">
              <Mail className="size-5 text-primary mb-2" />
              <p className="font-semibold text-sm">Código por correo</p>
              <p className="text-xs text-muted-foreground">Recibes un código de 6 dígitos en tu correo cada vez que inicias sesión.</p>
            </button>
          </div>
        ) : null}

        {setup ? (
          <FieldGroup className="rounded-lg bg-muted/40 p-4">
            {setup.method === "TOTP" ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <img src={setup.qr} alt="Código QR para la app autenticadora" className="size-44 rounded-md border border-border bg-white p-2" />
                <div className="space-y-2 text-xs">
                  <p>1. Escanea el código QR con tu app autenticadora.</p>
                  <p>2. Si no puedes escanearlo, ingresa esta clave manualmente:</p>
                  <code className="block break-all rounded bg-background px-2 py-1 font-mono text-[11px]">{setup.secret}</code>
                  <p>3. Escribe el código de 6 dígitos que muestra la app.</p>
                </div>
              </div>
            ) : <p className="text-xs">Escribe el código de 6 dígitos que enviamos a {setup.email}.</p>}
            <Field>
              <FieldLabel htmlFor="setup-code">Código</FieldLabel>
              <div className="flex gap-2">
                <Input id="setup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="max-w-40 font-mono tracking-[0.3em]" />
                <Button type="button" disabled={busy || code.replace(/\s/g, "").length !== 6} onClick={confirmSetup}>Activar</Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setSetup(null)}>Cancelar</Button>
              </div>
            </Field>
          </FieldGroup>
        ) : null}

        {recoveryCodes ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
            <p className="text-sm font-semibold">Guarda tus códigos de recuperación</p>
            <p className="text-xs text-muted-foreground">Solo se muestran ahora. Cada código sirve una vez si pierdes acceso a tu segundo factor.</p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">{recoveryCodes.map((item) => <span key={item} className="rounded bg-background px-2 py-1 text-center">{item}</span>)}</div>
            <Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(recoveryCodes.join("\n")); toast.success("Códigos copiados") }}><Copy className="size-4 mr-1.5" />Copiar</Button>
          </div>
        ) : null}

        {account.twoFactorEnabled ? (
          <FieldGroup>
            <p className="text-xs text-muted-foreground">Códigos de recuperación disponibles: <strong>{account.recoveryCodesLeft ?? 0}</strong>. Para regenerarlos o desactivar el 2FA, confirma tu contraseña.</p>
            <Field>
              <FieldLabel htmlFor="confirm-password">Contraseña actual</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Input id="confirm-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="max-w-64" />
                <Button type="button" variant="outline" disabled={busy || !password} onClick={regenerate}><KeyRound className="size-4 mr-1.5" />Regenerar códigos</Button>
                <Button type="button" variant="destructive" disabled={busy || !password} onClick={disable}>Desactivar 2FA</Button>
              </div>
            </Field>
          </FieldGroup>
        ) : null}
      </section>

      <section className="rounded-xl border border-border p-5 space-y-4">
        <p className="font-semibold text-sm">Cambiar contraseña</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="current-password">Contraseña actual</FieldLabel>
            <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-password">Nueva contraseña</FieldLabel>
            <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            <FieldDescription className="text-xs">Mínimo 8 caracteres, con letras y números.</FieldDescription>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !current || !next} onClick={changePassword}>Actualizar contraseña</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={logoutAll}><LogOut className="size-4 mr-1.5" />Cerrar las demás sesiones</Button>
        </div>
      </section>

      <section className="rounded-xl border border-border p-5 space-y-3">
        <p className="font-semibold text-sm">Actividad reciente</p>
        {events.length ? (
          <ul className="divide-y divide-border text-xs">
            {events.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 py-2">
                <span>{ACTIONS[item.action] ?? item.action}</span>
                <span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString("es-PE", { timeZone: "America/Lima" })}{item.ip ? ` · ${item.ip}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-muted-foreground">Sin actividad registrada.</p>}
      </section>
    </div>
  )
}
