import React, { useState, type FormEvent } from 'react';
import confetti from 'canvas-confetti';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Video,
} from 'lucide-react';

interface MedmindEventDetailProps {
  institution: string;
  organization: any;
  event: any;
  edition: any;
  speakers?: any[];
  activities?: any[];
  form?: any;
  heroImage?: string;
  heroVideo?: string;
  apiUrl: string;
}

type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

function getButtonClass(
  variant: ButtonVariant = 'default',
  size: ButtonSize = 'default',
  className: string = ''
) {
  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/30 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer';

  const variants: Record<ButtonVariant, string> = {
    default:
      'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 border border-transparent',
    outline:
      'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 hover:text-zinc-900',
    secondary:
      'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 border border-transparent',
    ghost:
      'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 border border-transparent',
  };

  const sizes: Record<ButtonSize, string> = {
    default: 'h-10 px-5 text-sm',
    sm: 'h-9 px-4 text-xs',
    lg: 'h-12 px-7 text-base font-semibold',
    icon: 'size-10',
  };

  return [base, variants[variant], sizes[size], className]
    .filter(Boolean)
    .join(' ');
}

function Button({
  variant = 'default',
  size = 'default',
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button className={getButtonClass(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

function ButtonLink({
  href,
  variant = 'default',
  size = 'default',
  className = '',
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={getButtonClass(variant, size, className)}>
      {children}
    </a>
  );
}

function EventTitle({ title }: { title: string }) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const midpoint = Math.ceil(words.length / 2);
  return (
    <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-zinc-900 leading-[1.08]">
      {words.slice(0, midpoint).join(' ')}{' '}
      <span className="text-teal-600">{words.slice(midpoint).join(' ')}</span>
    </h1>
  );
}

function FactCard({
  icon,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 px-4 py-3 text-left">
      <div className="text-teal-600 shrink-0">{icon}</div>
      <div className="min-w-0">
        <span className="block text-xs sm:text-sm font-semibold text-zinc-900 leading-tight">
          {primary}
        </span>
        <span className="block text-[11px] text-zinc-500 mt-0.5">
          {secondary}
        </span>
      </div>
    </div>
  );
}

function SpeakerCard({ speaker }: { speaker: any }) {
  const name =
    [speaker.firstName, speaker.lastName].filter(Boolean).join(' ') ||
    'Expositor invitado';
  const initials =
    [speaker.firstName?.[0], speaker.lastName?.[0]].filter(Boolean).join('') ||
    'DR';

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
      <div className="size-16 sm:size-20 rounded-full border border-zinc-200 bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 overflow-hidden font-semibold text-base sm:text-lg">
        {speaker.avatarUrl ? (
          <img
            src={speaker.avatarUrl}
            alt={name}
            className="size-full object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold text-zinc-900 tracking-tight">{name}</h3>
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-600 mt-0.5">
          Médico · Ponente oficial
        </p>
        {speaker.bio && (
          <p className="text-sm text-zinc-600 mt-2 leading-relaxed">
            {speaker.bio}
          </p>
        )}
      </div>
    </article>
  );
}

const webinarBenefits = [
  {
    title: 'El punto de partida real',
    description:
      'Qué significa hoy tener menos de 13 y qué margen de tiempo tienes realmente antes del RM 2027.',
  },
  {
    title: 'Prioridades de estudio',
    description:
      'En qué enfocar tus horas de estudio para que sumen puntaje donde más importa.',
  },
  {
    title: 'Errores que restan puntos',
    description:
      'Los errores más comunes de quienes postulan sin una estructura clara.',
  },
  {
    title: 'Tu plan de acción',
    description:
      'Los siguientes pasos concretos para ordenar tu preparación desde esta semana.',
  },
];

function BenefitCard({ item, index }: { item: (typeof webinarBenefits)[number]; index: number }) {
  return (
    <article className="group border-t border-zinc-200 py-7 first:border-t-0 sm:p-7 sm:first:border-t sm:odd:border-r">
      <span className="font-mono text-sm font-bold text-teal-600">{String(index + 1).padStart(2, '0')}</span>
      <h3 className="mt-4 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">{item.title}</h3>
      <p className="mt-3 max-w-md text-sm leading-7 text-zinc-600 sm:text-base">{item.description}</p>
    </article>
  );
}

function Field({ field }: { field: any }) {
  const choices = Array.isArray(field.options?.choices)
    ? field.options.choices
    : [];

  if (field.type === 'header') {
    return (
      <div className="col-span-full pt-4 pb-2 border-b border-zinc-100">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-teal-700">
          {field.options?.text || field.label}
        </h4>
      </div>
    );
  }

  if (field.type === 'radio') {
    return (
      <div className="col-span-full space-y-2">
        <label className="block text-sm font-medium text-zinc-700">
          {field.label}
          {field.required && <span className="text-rose-500 ml-1">*</span>}
        </label>
        <div className="flex flex-wrap gap-2.5">
          {choices.map((choice: string) => (
            <label
              key={choice}
              className="relative flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-700 cursor-pointer transition-all hover:bg-zinc-50 hover:border-zinc-300 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-600 has-[:checked]:text-white"
            >
              <input type="radio" name={field.key} value={choice} required={field.required} className="sr-only" />
              <span className="font-medium text-sm">{choice}</span>
            </label>
          ))}
        </div>
        {field.options?.helpText && (
          <p className="text-xs text-zinc-500">{field.options.helpText}</p>
        )}
      </div>
    );
  }

  if (field.type === 'multiple') {
    return (
      <div className="col-span-full space-y-2">
        <label className="block text-sm font-medium text-zinc-700">
          {field.label}
          {field.required && <span className="text-rose-500 ml-1">*</span>}
        </label>
        <div className="flex flex-wrap gap-2.5">
          {choices.map((choice: string) => (
            <label
              key={choice}
              className="relative flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-700 cursor-pointer transition-all hover:bg-zinc-50 hover:border-zinc-300 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50/50 has-[:checked]:text-teal-900"
            >
              <input type="checkbox" name={field.key} value={choice} className="peer sr-only" />
              <span className="grid size-4 shrink-0 place-items-center rounded-sm bg-zinc-200 text-white peer-checked:bg-teal-600 peer-checked:after:content-['✓'] peer-checked:after:text-[11px] peer-checked:after:font-bold" />
              <span className="font-medium text-sm">{choice}</span>
            </label>
          ))}
        </div>
        {field.options?.helpText && (
          <p className="text-xs text-zinc-500">{field.options.helpText}</p>
        )}
      </div>
    );
  }

  if (field.type === 'terms' || field.type === 'checkbox') {
    return (
      <div className="col-span-full mt-1">
        <label className="flex items-start gap-3 rounded-lg bg-zinc-50/50 p-3 text-sm text-zinc-600 cursor-pointer hover:bg-zinc-50 transition-colors">
          <input
            type="checkbox"
            name={field.key}
            required={field.required}
            className="peer sr-only"
          />
          <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm bg-zinc-200 text-white peer-checked:bg-teal-600 peer-checked:after:content-['✓'] peer-checked:after:text-[11px] peer-checked:after:font-bold" />
          <span className="leading-snug">
            {field.label}
            {field.required && <span className="text-rose-500 ml-1">*</span>}
          </span>
        </label>
      </div>
    );
  }

  const baseInputClass =
    'flex h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  const isFullWidth =
    field.type === 'textarea' ||
    field.key === 'email' ||
    field.key?.toLowerCase().includes('correo');

  return (
    <div className={isFullWidth ? 'col-span-full' : 'col-span-1'}>
      <label className="block text-sm font-medium text-zinc-700 mb-1.5">
        {field.label}
        {field.required && <span className="text-rose-500 ml-1">*</span>}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          required={field.required}
          name={field.key}
          placeholder={field.options?.placeholder}
          className="flex min-h-[90px] w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors"
        />
      ) : field.type === 'select' ? (
        <div className="relative">
          <select
            required={field.required}
            name={field.key}
            className={`${baseInputClass} appearance-none pr-9`}
          >
            <option value="">Selecciona una opción</option>
            {choices.map((choice: any) => (
              <option key={String(choice)} value={choice}>
                {choice}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
        </div>
      ) : field.type === 'phone' || /phone|telefono|teléfono|whatsapp|celular/i.test(`${field.key} ${field.label}`) ? (
        <div className="flex h-10 overflow-hidden rounded-lg border border-zinc-300 bg-white focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20">
          <span className="flex items-center border-r border-zinc-200 px-3 text-xs font-medium text-zinc-600">PE +51⌄</span>
          <input required={field.required} name={field.key} type="tel" inputMode="tel" placeholder="987 654 321" className="min-w-0 flex-1 px-3 text-sm text-zinc-900 outline-none" />
        </div>
      ) : (
        <input
          required={field.required}
          name={field.key}
          type={
            field.type === 'email'
              ? 'email'
              : field.type === 'phone'
                ? 'tel'
                : 'text'
          }
          placeholder={field.options?.placeholder}
          className={baseInputClass}
        />
      )}

      {field.options?.helpText && (
        <p className="text-xs text-zinc-500 mt-1">{field.options.helpText}</p>
      )}
    </div>
  );
}

export function MedmindEventDetail({
  institution,
  organization,
  event,
  edition,
  speakers = [],
  activities = [],
  form,
  heroImage,
  apiUrl,
}: MedmindEventDetailProps) {
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [thankYouMessage, setThankYouMessage] = useState('');

  const startDateStr = edition?.startDate || event.startDate;
  const date = startDateStr ? new Date(startDateStr) : null;
  const dateText = date
    ? date.toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    : 'Fecha por confirmar';
  const weekdayText = date
    ? date.toLocaleDateString('es-PE', { weekday: 'long' })
    : '';
  const timeText = date
    ? date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : 'Hora por definir';

  const fields = form?.fields || [];
  const description =
    edition?.description || event.details?.content || event.description;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const answers: Record<string, unknown> = {};

    for (const key of new Set([...data.keys()])) {
      const values = data.getAll(key).map(String);
      answers[key] = values.length > 1 ? values : values[0] || '';
    }

    setStatus('');
    setIsLoading(true);

    try {
      const response = await fetch(
        `${apiUrl}/public/registration-forms/${form.slug}/submissions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(body.message || 'No se pudo completar el registro.');
        setIsLoading(false);
        return;
      }
      confetti({ particleCount: 130, spread: 70, origin: { y: 0.65 }, colors: ['#0d9488', '#14b8a6', '#ffffff'] });
      if (body.thankYouRedirectUrl) { window.location.assign(body.thankYouRedirectUrl); return; }
      const token = body.registration?.accessToken ? `&token=${encodeURIComponent(body.registration.accessToken)}` : '';
      window.setTimeout(() => window.location.assign(`/${institution}/register/${form.slug}/success?eventId=${encodeURIComponent(event.id)}${token}`), 650);
    } catch {
      setStatus(
        'Ocurrió un error al enviar el formulario. Por favor intenta de nuevo.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="w-full min-h-screen overflow-x-hidden bg-white font-sans text-zinc-900 antialiased">
      {/* 1. Header / Navbar */}
      <header className="fixed inset-x-0 top-0 z-50 w-full border-b border-zinc-200/80 bg-white/95 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a
            href={`/${institution}`}
            className="flex items-center gap-3 no-underline"
          >
            <img src="/medmind/logo_medmind.svg" alt="MedMind" className="h-8 w-auto max-w-[154px] object-contain" />
            <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-teal-700">
              WEBINAR
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600">
            {speakers.length > 0 && (
              <a
                href="#ponentes"
                className="transition-colors hover:text-teal-600"
              >
                Expositores
              </a>
            )}
            {activities.length > 0 && (
              <a
                href="#temario"
                className="transition-colors hover:text-teal-600"
              >
                Temario
              </a>
            )}
            {form && (
              <a
                href="#registro"
                className="transition-colors hover:text-teal-600"
              >
                Reservar cupo
              </a>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {form && (
              <ButtonLink href="#registro" size="sm">
                Reservar cupo
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section id="inicio" className="w-full relative pb-12 pt-28 sm:pb-16 sm:pt-32 lg:pb-24 lg:pt-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Left Column: Headline, Description, Facts, CTAs */}
            <div className="lg:col-span-7 flex flex-col items-start text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50/80 px-3.5 py-1 text-xs font-semibold text-teal-700 mb-6">
                <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                <span>WEBINAR GRATUITO · EN VIVO</span>
              </div>

              <EventTitle title={event.eventName} />

              {description && (
                <p className="mt-5 text-base sm:text-lg text-zinc-600 leading-relaxed font-normal max-w-2xl">
                  {description}
                </p>
              )}

              {/* Facts Row */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full max-w-2xl">
                <FactCard
                  icon={<CalendarDays className="size-5" />}
                  primary={dateText}
                  secondary={weekdayText ? `Día ${weekdayText}` : 'Fecha oficial'}
                />
                <FactCard
                  icon={<Clock3 className="size-5" />}
                  primary={`${timeText} (Perú)`}
                  secondary="Hora exacta de inicio"
                />
                <FactCard
                  icon={<Video className="size-5" />}
                  primary="100% Online"
                  secondary="Vía transmisión en vivo"
                />
              </div>

              {/* Action Buttons (rounded-full) */}
              <div className="mt-9 flex flex-wrap items-center gap-4">
                {form && (
                  <ButtonLink href="#registro" size="lg">
                    Quiero mi cupo gratis
                    <ArrowRight className="size-4" />
                  </ButtonLink>
                )}
                {activities.length > 0 && (
                  <ButtonLink href="#temario" variant="outline" size="lg">
                    Explorar temario
                  </ButtonLink>
                )}
              </div>
            </div>

            {/* Right Column: Hero Graphic without border */}
            {heroImage && (
              <div className="lg:col-span-5 flex items-center justify-center">
                <img
                  src={heroImage}
                  alt={event.eventName}
                  className="max-h-[440px] sm:max-h-[480px] w-auto max-w-full object-contain"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Temario / Agenda Section */}
      {activities.length > 0 && (
        <section
          id="temario"
          className="w-full border-t border-zinc-200/80 bg-zinc-50/50 py-16 sm:py-24"
        >
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-600 block mb-1">
                Temario
              </span>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-zinc-900">
                Todo lo que necesitas para prepararte mejor
              </h2>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {activities.map((item: any, index: number) => (
                <article
                  key={item.id || index}
                  className="rounded-xl border border-zinc-200 bg-white p-6"
                >
                  <span className="font-mono text-xs font-bold text-teal-600">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 text-base font-bold text-zinc-900">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 4. Expositores / Speakers Section */}
      {speakers.length > 0 && (
        <section
          id="ponentes"
          className="w-full border-t border-zinc-200/80 py-16 sm:py-24"
        >
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <span className="text-sm font-bold uppercase tracking-[0.18em] text-teal-600 block mb-3">
                Expositores
              </span>
              <h2 className="text-4xl font-bold leading-[1.04] tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl">
                ¿Quiénes te acompañarán en este{' '}
                <span className="text-teal-600">webinar?</span>
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-600 sm:text-lg">
                Médicos con experiencia real y resultados comprobados, listos
                para compartir su estrategia y resolver tus dudas en vivo.
              </p>
            </div>

            <div
              className={`mt-10 grid gap-6 ${speakers.length === 1 ? 'max-w-2xl' : 'sm:grid-cols-2 max-w-5xl'
                }`}
            >
              {speakers.map((speaker: any, index: number) => (
                <SpeakerCard key={speaker.id || index} speaker={speaker} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5. Agenda & benefits */}
      <section id="beneficios" className="w-full border-t border-zinc-200 bg-zinc-50/70 py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <span className="block text-xs font-semibold uppercase tracking-wider text-teal-600">Agenda &amp; beneficios</span>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl">
              ¿Qué te llevas de este <span className="text-teal-600">webinar?</span>
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
              Contenido pensado para que salgas con un plan claro, no solo con más información.
            </p>
          </div>
          <div className="mt-10 grid border-y border-zinc-200 sm:grid-cols-2">
            {webinarBenefits.map((item, index) => <BenefitCard key={item.title} item={item} index={index} />)}
          </div>
        </div>
      </section>

      {/* 6. Registration Section (Background with primary brand color) */}
      {form && (
        <section
          id="registro"
          className="w-full bg-teal-600 py-16 sm:py-24"
        >
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-4xl">
              <div className="w-full rounded-3xl bg-white p-7 sm:p-12">
                <div className="mx-auto text-center">
                  <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-teal-600">
                    Acceso 100% gratuito
                  </p>
                  <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-zinc-900">
                    Reserva tu cupo <span className="text-teal-600">gratis</span>
                  </h2>
                  <p className="text-sm text-zinc-600 mt-2">
                    Cupos limitados · {dateText}, {timeText} (Hora Perú)
                  </p>
                </div>

                {done ? (
                  <div className="mt-8 rounded-2xl border border-teal-200 bg-teal-50/60 p-8 text-center">
                    <CheckCircle2 className="size-12 text-teal-600 mx-auto" />
                    <h3 className="text-lg font-bold text-zinc-900 mt-3">
                      ¡Registro confirmado!
                    </h3>
                    <p className="text-sm text-zinc-600 mt-1 max-w-md mx-auto">
                      {thankYouMessage}
                    </p>
                    <div className="mt-6">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDone(false)}
                      >
                        Registrar a otra persona
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={submit}
                    className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4"
                  >
                    {fields.map((field: any) => (
                      <Field key={field.key} field={field} />
                    ))}

                    <div className="col-span-full pt-3">
                      <Button
                        type="submit"
                        size="lg"
                        disabled={isLoading}
                        className="w-full text-base font-semibold h-12"
                      >
                        {isLoading ? 'Enviando registro...' : 'Quiero mi cupo gratis'}
                        {!isLoading && <ArrowRight className="size-4" />}
                      </Button>

                      {status && (
                        <p className="text-center text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3 mt-3">
                          {status}
                        </p>
                      )}

                      <p className="text-center text-xs text-zinc-500 mt-3.5">
                        Al registrarte aceptas recibir comunicaciones de MedMind
                        sobre este webinar.
                      </p>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 7. Footer */}
      <footer className="w-full border-t border-zinc-200 bg-white py-12">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8">
          <div>
            <img src="/medmind/logo_medmind.svg" alt="MedMind" className="mx-auto h-8 w-auto max-w-[154px] sm:mx-0" />
            <p className="text-xs text-zinc-500 mt-1">
              Webinar oficial · {dateText} · {timeText} (Perú)
            </p>
          </div>
          <div className="text-xs text-zinc-400">
            © {new Date().getFullYear()} MedMind. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </main>
  );
}
