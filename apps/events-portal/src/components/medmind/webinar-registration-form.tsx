'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import {
    Calendar,
    MessageCircle,
    Loader2,
    AlertCircle,
    ArrowLeft,
    Check
} from 'lucide-react'
import { LogoRender } from '@/components/app/logo-render'
import { Button } from '@/components/ui/button'
import { PhoneCountryInput } from '@/components/ui/phone-country-input'
import { registerEvent } from '@/services/events.service'
import { checkWebinarRegistration } from '@/services/webinar.service'
import { WEBINAR_EVENT_TYPE } from '@/config/constants'

const DEFAULT_EVENT_TYPE = WEBINAR_EVENT_TYPE || 'webinar-7-setiembre-2026'

export interface WebinarRegistrationFormProps {
    eventType?: string
    webinarId?: string
    formSlug?: string
    apiUrl?: string
    dateLabel?: string
    timeLabel?: string
    eventTitle?: string
}

export function WebinarRegistrationForm({
    eventType,
    webinarId,
    formSlug,
    apiUrl,
    dateLabel = 'Lunes, 7 de setiembre de 2026',
    timeLabel = '8:00 PM (Hora Perú)',
    eventTitle,
}: WebinarRegistrationFormProps) {
    const targetEventType = formSlug || eventType || webinarId || DEFAULT_EVENT_TYPE

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        countryCode: '+51',
        whatsapp: '',
        email: '',
        currentSituation: 'Estoy haciendo SERUMS',
        desiredSpecialty: '',
        firstAttempt: 'Sí',
    })

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [errors, setErrors] = useState<{ [key: string]: string }>({})
    const [serverError, setServerError] = useState<string | null>(null)
    const [emailCheckStatus, setEmailCheckStatus] = useState<'idle' | 'checking' | 'available' | 'registered'>('idle')

    // Verificación en tiempo real del correo con debounce
    useEffect(() => {
        const email = formData.email.trim().toLowerCase()
        const isValidEmailFormat = /\S+@\S+\.\S+/.test(email)

        if (!email || !isValidEmailFormat) {
            setEmailCheckStatus('idle')
            return
        }

        const timer = setTimeout(async () => {
            setEmailCheckStatus('checking')
            try {
                const res = await checkWebinarRegistration({
                    email,
                    webinarId: targetEventType
                })

                if (res.success) {
                    const isRegistered = Boolean(
                        res.data?.isRegistered ||
                        res.data?.registered ||
                        (res.data && typeof res.data === 'object' && res.data.id)
                    )

                    if (isRegistered) {
                        setEmailCheckStatus('registered')
                        setErrors((prev) => ({
                            ...prev,
                            email: 'Este correo ya se encuentra registrado en este webinar.'
                        }))
                    } else {
                        setEmailCheckStatus('available')
                        setErrors((prev) => {
                            const newErrors = { ...prev }
                            if (newErrors.email === 'Este correo ya se encuentra registrado en este webinar.') {
                                delete newErrors.email
                            }
                            return newErrors
                        })
                    }
                } else {
                    // Si el backend devuelve error (ej. en desarrollo o no disponible), dejamos estado idle para no bloquear
                    setEmailCheckStatus('idle')
                }
            } catch {
                setEmailCheckStatus('idle')
            }
        }, 500)

        return () => clearTimeout(timer)
    }, [formData.email, targetEventType])


    const situations = [
        'Estoy haciendo SERUMS',
        'Ya terminé SERUMS',
        'Voy a repostular',
        'Estudiante de Medicina'
    ]

    const triggerConfetti = () => {
        try {
            const count = 200
            const defaults = { origin: { y: 0.6 } }

            const fire = (particleRatio: number, opts: confetti.Options) => {
                confetti({
                    ...defaults,
                    ...opts,
                    particleCount: Math.floor(count * particleRatio)
                })
            }

            fire(0.25, { spread: 30, startVelocity: 60 })
            fire(0.2, { spread: 65 })
            fire(0.35, { spread: 100, decay: 0.91, scalar: 0.85 })
            fire(0.1, { spread: 130, startVelocity: 30, decay: 0.92, scalar: 1.2 })
            fire(0.1, { spread: 130, startVelocity: 50 })
        } catch {
            // No bloquear si canvas-confetti falla
        }
    }

    const validate = () => {
        const newErrors: { [key: string]: string } = {}
        if (!formData.firstName.trim()) {
            newErrors.firstName = 'Ingresa tu nombre'
        }
        if (!formData.lastName.trim()) {
            newErrors.lastName = 'Ingresa tus apellidos'
        }
        if (!formData.whatsapp.trim()) {
            newErrors.whatsapp = 'Ingresa tu número de WhatsApp'
        } else if (formData.whatsapp.replace(/\D/g, '').length < 6) {
            newErrors.whatsapp = 'Ingresa un número de teléfono válido'
        }
        if (!formData.email.trim()) {
            newErrors.email = 'Ingresa tu correo electrónico'
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Ingresa un correo electrónico válido'
        }
        if (!formData.desiredSpecialty.trim()) {
            newErrors.desiredSpecialty = 'Indica la especialidad que te interesa'
        }
        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setServerError(null)
        if (!validate()) return

        if (emailCheckStatus === 'registered') {
            setErrors((prev) => ({
                ...prev,
                email: 'Este correo ya se encuentra registrado en este webinar.'
            }))
            return
        }

        setIsSubmitting(true)
        try {
            const res = await registerEvent({
                eventType: targetEventType,
                formSlug: formSlug || targetEventType,
                apiUrl: apiUrl,
                firstName: formData.firstName.trim(),
                lastName: formData.lastName.trim(),
                email: formData.email.trim().toLowerCase(),
                whatsapp: formData.whatsapp.trim(),
                countryCode: formData.countryCode || '+51',
                currentSituation: formData.currentSituation,
                desiredSpecialty: formData.desiredSpecialty.trim(),
                additionalPayload: {
                    isFirstAttempt: formData.firstAttempt === 'Sí'
                }
            })

            if (res.success) {
                setIsSubmitted(true)
                triggerConfetti()
                toast.success('¡Registro exitoso!', {
                    description: res.message || 'Tu lugar ha sido reservado. Te esperamos en el webinar.'
                })
            } else {
                const title = res.statusCode === 409 ? 'Correo ya registrado' : 'Error en la inscripción'
                const errorMessage = res.error?.message || res.message || 'Ocurrió un error al procesar tu inscripción. Inténtalo nuevamente.'
                setServerError(errorMessage)
                toast.error(title, {
                    description: errorMessage
                })
            }
        } catch (error: any) {
            const errorMessage = error?.message || 'Error de conexión con el servidor'
            setServerError(errorMessage)
            toast.error('Error de conexión', {
                description: errorMessage
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const getGoogleCalendarUrl = () => {
        const title = encodeURIComponent('Webinar Gratuito MedMind: ¿Cómo prepararme para el ENAM y el Residentado 2027 con una sola estrategia?')
        const details = encodeURIComponent('Sesión en vivo con Dra. María Reneé Montesinos y Diego. Acceso 100% online.')
        const location = encodeURIComponent('Zoom en Vivo')
        const start = '20260907T200000'
        const end = '20260907T213000'
        return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`
    }

    return (
        <section id="registro" className="w-full py-16 md:py-24 bg-medmind-primary border-y border-border/40 relative overflow-hidden">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

                {/* Centered Main Card Container with Wider max-w */}
                <div className="max-w-4xl mx-auto">

                    <div className="bg-background text-foreground rounded-3xl border border-border/80 p-6 sm:p-10 md:p-12 shadow-none transition-all">

                        {isSubmitted ? (
                            /* SUCCESS STATE UI - Shopify Style Celebratory Layout */
                            <motion.div
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                                className="flex flex-col items-center text-center"
                            >
                                {/* Brand Logo Header */}
                                <div className="mb-4">
                                    <LogoRender
                                        variant="full"
                                        className="w-32 sm:w-36 text-foreground"
                                        classNameImg="text-foreground"
                                    />
                                </div>

                                <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground uppercase leading-tight mb-3">
                                    ¡TU LUGAR ESTÁ <span className="text-[#00b49d]">RESERVADO!</span>
                                </h2>

                                <div className="relative my-6 flex items-center justify-center">
                                    <img
                                        src="/assets/images/webinar-registration-success.png"
                                        alt="Registro confirmado"
                                        width={320}
                                        height={320}
                                        className="w-48 h-48 sm:w-56 sm:h-56 object-contain animate-in zoom-in-75 duration-500"
                                    />
                                </div>

                                {/* Confirmation Details Card */}
                                <div className="w-full max-w-xl bg-muted/30 border border-border/80 rounded-2xl p-5 sm:p-6 mb-6 text-left space-y-3 shadow-none">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-medmind-primary/10 text-medmind-primary flex items-center justify-center shrink-0">
                                            <Check className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-mono font-medium">Participante</p>
                                            <p className="text-sm font-medium text-foreground">{formData.firstName} {formData.lastName}</p>
                                        </div>
                                    </div>

                                    <div className="h-px bg-border/60 w-full" />

                                    <p className="text-xs sm:text-sm text-muted-foreground font-normal leading-relaxed">
                                        Hemos enviado tu confirmación y enlace de acceso a <strong className="text-foreground font-medium">{formData.email}</strong>.
                                    </p>
                                    <p className="text-xs text-muted-foreground font-normal">
                                        📅 <strong className="text-foreground font-medium">{dateLabel}</strong> · 🕗 <strong className="text-foreground font-medium">{timeLabel}</strong> vía Zoom en Vivo.
                                    </p>
                                </div>

                                {/* CTA Action Buttons */}
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full max-w-xl mb-6">
                                    <a
                                        href="https://chat.whatsapp.com/KmEd3KcBymoE2yOvOXDsUS?s=cl&p=a&ilr=1"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full sm:flex-1 min-h-12 py-3 px-4 sm:px-6 rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-medium text-xs sm:text-sm flex items-center justify-center text-center gap-2 transition-colors shadow-none cursor-pointer leading-snug"
                                    >
                                        <MessageCircle className="w-4 h-4 shrink-0" />
                                        <span>Unirme a la comunidad de WhatsApp</span>
                                    </a>

                                    <a
                                        href={getGoogleCalendarUrl()}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full sm:w-auto min-h-12 py-3 px-5 sm:px-6 rounded-full border border-border bg-background hover:bg-muted text-foreground font-medium text-xs sm:text-sm flex items-center justify-center text-center gap-2 transition-colors shadow-none cursor-pointer leading-snug shrink-0"
                                    >
                                        <Calendar className="w-4 h-4 shrink-0 text-medmind-cyan" />
                                        <span>Añadir a Calendar</span>
                                    </a>
                                </div>

                                {/* Reset Link */}
                                <button
                                    onClick={() => {
                                        setIsSubmitted(false)
                                        setServerError(null)
                                        setFormData({
                                            firstName: '',
                                            lastName: '',
                                            countryCode: '+51',
                                            whatsapp: '',
                                            email: '',
                                            currentSituation: situations[0],
                                            desiredSpecialty: '',
                                            firstAttempt: 'Sí',
                                        })
                                    }}
                                    className="text-xs text-medmind-cyan hover:underline cursor-pointer font-medium flex items-center gap-1.5 pt-1"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    <span>Inscribir a otro participante</span>
                                </button>
                            </motion.div>
                        ) : (
                            /* FORM STATE UI - Clean Centered Form */
                            <div>
                                <div className="text-center mb-8 sm:mb-10">
                                    <span className="text-medmind-cyan text-xs sm:text-sm tracking-widest uppercase font-mono font-medium block mb-2">
                                        ACCESO 100% GRATUITO
                                    </span>
                                    <h2 className="text-2xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-foreground uppercase leading-tight mb-3">
                                        RESERVA TU CUPO <span className="text-[#00b49d]">GRATIS</span>
                                    </h2>
                                    <p className="text-xs sm:text-sm md:text-base text-muted-foreground font-normal leading-relaxed">
                                        Cupos limitados · 7 de setiembre, 8:00 PM (Hora Perú)
                                    </p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {serverError && (
                                        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs sm:text-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-destructive" />
                                            <div className="flex-1 space-y-0.5">
                                                <p className="font-semibold text-destructive">Error en la inscripción</p>
                                                <p className="text-destructive/90 leading-relaxed">{serverError}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Nombres y Apellidos */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] sm:text-xs font-mono font-medium tracking-wider uppercase text-foreground/80 block">
                                                Nombres
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ej. Ana"
                                                value={formData.firstName}
                                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                                className={`w-full h-11 px-4 rounded-xl border bg-background text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-medmind-primary shadow-none transition-colors ${errors.firstName ? 'border-destructive' : 'border-border'
                                                    }`}
                                            />
                                            {errors.firstName && (
                                                <p className="text-[11px] text-destructive">{errors.firstName}</p>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[11px] sm:text-xs font-mono font-medium tracking-wider uppercase text-foreground/80 block">
                                                Apellidos
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ej. Torres Pérez"
                                                value={formData.lastName}
                                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                                className={`w-full h-11 px-4 rounded-xl border bg-background text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-medmind-primary shadow-none transition-colors ${errors.lastName ? 'border-destructive' : 'border-border'
                                                    }`}
                                            />
                                            {errors.lastName && (
                                                <p className="text-[11px] text-destructive">{errors.lastName}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* WhatsApp con Selector de País / Bandera & Email */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] sm:text-xs font-mono font-medium tracking-wider uppercase text-foreground/80 block">
                                                WhatsApp
                                            </label>
                                            <PhoneCountryInput
                                                countryCode={formData.countryCode}
                                                phoneNumber={formData.whatsapp}
                                                onCountryCodeChange={(code) => setFormData({ ...formData, countryCode: code })}
                                                onPhoneNumberChange={(phone) => setFormData({ ...formData, whatsapp: phone })}
                                                hasError={Boolean(errors.whatsapp)}
                                                placeholder="987 654 321"
                                            />
                                            {errors.whatsapp && (
                                                <p className="text-[11px] text-destructive">{errors.whatsapp}</p>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[11px] sm:text-xs font-mono font-medium tracking-wider uppercase text-foreground/80 block">
                                                    Correo electrónico
                                                </label>
                                                {emailCheckStatus === 'available' && (
                                                    <span className="text-[10px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 animate-in fade-in duration-300">
                                                        Disponible
                                                    </span>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="email"
                                                    placeholder="tucorreo@ejemplo.com"
                                                    value={formData.email}
                                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                    className={`w-full h-11 pl-4 pr-11 rounded-xl border bg-background text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none shadow-none transition-colors ${errors.email
                                                        ? 'border-destructive focus:border-destructive'
                                                        : emailCheckStatus === 'available'
                                                            ? 'border-emerald-500/70 focus:border-emerald-500 ring-emerald-500/20'
                                                            : 'border-border focus:border-medmind-primary'
                                                        }`}
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                                                    {emailCheckStatus === 'checking' && (
                                                        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                                                    )}
                                                    {emailCheckStatus === 'available' && (
                                                        <div
                                                            className="w-6 h-6 rounded-full bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center animate-in zoom-in-50 duration-200"
                                                            title="Correo disponible para registrarse"
                                                        >
                                                            <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                                                        </div>
                                                    )}
                                                    {emailCheckStatus === 'registered' && (
                                                        <div
                                                            className="w-6 h-6 rounded-full bg-destructive/15 text-destructive flex items-center justify-center animate-in zoom-in-50 duration-200"
                                                            title="Ya registrado"
                                                        >
                                                            <AlertCircle className="w-3.5 h-3.5" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {errors.email && (
                                                <p className="text-[11px] text-destructive">{errors.email}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Situación actual */}
                                    <div className="space-y-2">
                                        <label className="text-[11px] sm:text-xs font-mono font-medium tracking-wider uppercase text-foreground/80 block">
                                            Situación actual
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {situations.map((st, idx) => {
                                                const isSelected = formData.currentSituation === st
                                                return (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, currentSituation: st })}
                                                        className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium border transition-colors cursor-pointer shadow-none ${isSelected
                                                            ? 'bg-[#00b49d] border-[#00b49d] text-white'
                                                            : 'bg-background border-border text-muted-foreground hover:text-foreground'
                                                            }`}
                                                    >
                                                        {st}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* ¿Qué especialidad te interesa? */}
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] sm:text-xs font-mono font-medium tracking-wider uppercase text-foreground/80 block">
                                            ¿Qué especialidad te interesa?
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ej. Pediatría, Cirugía, Medicina Interna…"
                                            value={formData.desiredSpecialty}
                                            onChange={(e) => setFormData({ ...formData, desiredSpecialty: e.target.value })}
                                            className={`w-full h-11 px-4 rounded-xl border bg-background text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-medmind-primary shadow-none transition-colors ${errors.desiredSpecialty ? 'border-destructive' : 'border-border'
                                                }`}
                                        />
                                        {errors.desiredSpecialty && (
                                            <p className="text-[11px] text-destructive">{errors.desiredSpecialty}</p>
                                        )}
                                    </div>

                                    {/* ¿Será tu primera postulación? */}
                                    <div className="space-y-2">
                                        <label className="text-[11px] sm:text-xs font-mono font-medium tracking-wider uppercase text-foreground/80 block">
                                            ¿Será tu primera postulación?
                                        </label>
                                        <div className="flex gap-2">
                                            {['Sí', 'No'].map((opt, idx) => {
                                                const isSelected = formData.firstAttempt === opt
                                                return (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, firstAttempt: opt })}
                                                        className={`px-5 py-2 rounded-full text-xs sm:text-sm font-medium border transition-colors cursor-pointer shadow-none ${isSelected
                                                            ? 'bg-[#00b49d] border-[#00b49d] text-white'
                                                            : 'bg-background border-border text-muted-foreground hover:text-foreground'
                                                            }`}
                                                    >
                                                        {opt}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* BOTÓN ENVIAR */}
                                    <div className="pt-3">
                                        <Button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full h-12 rounded-full bg-[#00b49d] hover:bg-[#00a2b6] text-white font-medium text-sm sm:text-base shadow-none transition-colors cursor-pointer"
                                            variant="default"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    <span>Reservando tu cupo...</span>
                                                </>
                                            ) : (
                                                <span>Quiero mi cupo gratis</span>
                                            )}
                                        </Button>
                                    </div>

                                    <p className="text-[11px] text-center text-muted-foreground pt-1">
                                        Al registrarte aceptas recibir comunicaciones de MedMind sobre este webinar.
                                    </p>

                                </form>
                            </div>
                        )}

                    </div>

                </div>

            </div>
        </section>
    )
}
