'use client'

import { useState, useEffect } from 'react'
import { Moon, Sun, Menu, X, ArrowRight } from 'lucide-react'
import { LogoRender } from '@/components/app/logo-render'

export interface WebinarNavbarProps {
    institution?: string;
    hasSpeakers?: boolean;
    hasAgenda?: boolean;
}

export function WebinarNavbar({ institution = 'medmind', hasSpeakers = true, hasAgenda = true }: WebinarNavbarProps) {
    const [isAtTop, setIsAtTop] = useState(true)
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [theme, setTheme] = useState('light')
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        const handleScroll = () => {
            setIsAtTop(window.scrollY < 20)
        }
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const scrollToSection = (id: string) => {
        setIsMobileMenuOpen(false)
        const el = document.getElementById(id)
        if (el) {
            el.scrollIntoView({ behavior: 'smooth' })
        }
    }

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${isAtTop
                ? 'bg-background/60 backdrop-blur-md border-b border-border/30'
                : 'bg-background/95 backdrop-blur-md border-b border-border/60 shadow-sm'
                }`}
        >
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16 sm:h-20">
                    {/* Brand */}
                    <div className="flex items-center gap-3">
                        <a href={`/${institution}`} className="flex items-center">
                            <LogoRender
                                variant="full"
                                className="w-28 sm:w-32 text-foreground"
                                classNameImg="text-foreground"
                            />
                        </a>
                        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-medium tracking-wide uppercase bg-medmind-cyan/10 text-medmind-cyan border border-medmind-cyan/20">
                            Webinar
                        </span>
                    </div>

                    {/* Navigation Desktop */}
                    <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
                        {hasSpeakers && (
                            <button
                                onClick={() => scrollToSection('mentores')}
                                className="hover:text-foreground transition-colors cursor-pointer"
                            >
                                Expositores
                            </button>
                        )}
                        {hasAgenda && (
                            <button
                                onClick={() => scrollToSection('temario')}
                                className="hover:text-foreground transition-colors cursor-pointer"
                            >
                                Temario
                            </button>
                        )}
                        <button
                            onClick={() => scrollToSection('registro')}
                            className="hover:text-foreground transition-colors cursor-pointer"
                        >
                            Reservar cupo
                        </button>
                    </nav>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        {mounted && (
                            <button
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                                aria-label="Cambiar tema"
                            >
                                {theme === 'dark' ? (
                                    <Sun className="w-4 h-4" />
                                ) : (
                                    <Moon className="w-4 h-4" />
                                )}
                            </button>
                        )}

                        <button
                            onClick={() => scrollToSection('registro')}
                            className="hidden sm:inline-flex items-center gap-2 h-10 px-5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs sm:text-sm font-semibold tracking-wide transition-colors cursor-pointer shadow-none"
                        >
                            <span>Reservar cupo</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        {/* Mobile menu trigger */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="md:hidden p-2 text-foreground hover:bg-muted/60 rounded-md cursor-pointer"
                            aria-label="Menu"
                        >
                            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile dropdown */}
            {isMobileMenuOpen && (
                <div className="md:hidden border-b border-border bg-background px-4 py-4 space-y-3">
                    {hasSpeakers && (
                        <button
                            onClick={() => scrollToSection('mentores')}
                            className="block w-full text-left py-2 text-sm font-medium text-foreground hover:text-medmind-cyan"
                        >
                            Expositores
                        </button>
                    )}
                    {hasAgenda && (
                        <button
                            onClick={() => scrollToSection('temario')}
                            className="block w-full text-left py-2 text-sm font-medium text-foreground hover:text-medmind-cyan"
                        >
                            Temario
                        </button>
                    )}
                    <button
                        onClick={() => scrollToSection('registro')}
                        className="block w-full text-left py-2 text-sm font-medium text-foreground hover:text-medmind-cyan"
                    >
                        Reservar cupo
                    </button>
                    <button
                        onClick={() => scrollToSection('registro')}
                        className="w-full flex items-center justify-center gap-2 h-11 rounded-full bg-black dark:bg-white text-white dark:text-black text-sm font-semibold tracking-wide transition-colors shadow-none mt-2 cursor-pointer"
                    >
                        <span>Reservar cupo</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </header>
    )
}
