import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { z } from "zod"
import { useAuthStore } from "@/store/auth.store"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { MediaUploader } from "@/components/MediaUploader"
import { X } from "lucide-react"

const organizationSchema = z.object({
  name: z.string().min(3, "El nombre de la organización debe tener al menos 3 caracteres"),
  type: z.string().min(2, "El tipo de organización es requerido"),
  email: z.string().refine((val) => {
    if (!val) return true;
    const parts = val.split(",").map(p => p.trim());
    return parts.every(p => !p || /\S+@\S+\.\S+/.test(p));
  }, "Uno o más correos son inválidos").optional(),
  slug: z.string()
    .min(3, "El slug debe tener al menos 3 caracteres")
    .regex(/^[a-z0-9-]+$/, "El slug solo debe contener letras minúsculas, números y guiones"),
  description: z.string().optional(),
  contactPhone: z.string().optional(),
  documentNumber: z.string().optional(),
  brand: z.string().optional(),
  logoUrl: z.string().url("Enlace de logo inválido").or(z.literal("")).optional(),
  coverUrl: z.string().url("Enlace de portada inválido").or(z.literal("")).optional(),
  faviconUrl: z.string().url("Enlace de favicon inválido").or(z.literal("")).optional(),
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Color hexadecimal inválido (ej. #7C3AED)").or(z.literal("")).optional(),
})

type OrganizationInput = z.infer<typeof organizationSchema>

import { useSEO } from "@/hooks/use-seo"
import { getRoleLabel } from "@/lib/role-labels"

function isCurrentMember(member: any, accountId?: string) {
  if (!accountId) return false
  return member.accountId === accountId || member.account_id === accountId || member.profile?.authUserId === accountId || member.profile?.auth_user_id === accountId || member.profileId === accountId || member.profile_id === accountId
}

export function OrganizationSettingsPage() {
  const navigate = useNavigate()
  const { user, selectedOrganization, selectOrganization, setOrganizations, organizations } = useAuthStore()
  const organizationId = selectedOrganization?.id || ""

  useSEO({
    title: "Ajustes de la Organización",
    description: selectedOrganization
      ? `Configura la información general, logotipo, portadas y parámetros de visualización para ${selectedOrganization.name}.`
      : "Configuración de la organización."
  })

  const [name, setName] = useState("")
  const [type, setType] = useState("")
  const [emails, setEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")

  const addEmail = (e: React.MouseEvent) => {
    e.preventDefault()
    const parts = newEmail.split(/[\s,;]+/).map(p => p.trim()).filter(Boolean)
    if (parts.length === 0) return

    const invalidParts = parts.filter(p => !/\S+@\S+\.\S+/.test(p))
    if (invalidParts.length > 0) {
      toast.error(`Uno o más correos son inválidos: ${invalidParts.join(", ")}`)
      return
    }

    const uniqueNew = parts.filter(p => !emails.includes(p))
    if (uniqueNew.length > 0) {
      setEmails([...emails, ...uniqueNew])
    }
    setNewEmail("")
  }

  const removeEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index))
  }

  const addPhone = (e: React.MouseEvent) => {
    e.preventDefault()
    const parts = newPhone.split(/[\s,;]+/).map(p => p.trim()).filter(Boolean)
    if (parts.length === 0) return

    const uniqueNew = parts.filter(p => !contactPhones.includes(p))
    if (uniqueNew.length > 0) {
      setContactPhones([...contactPhones, ...uniqueNew])
    }
    setNewPhone("")
  }

  const removePhone = (index: number) => {
    setContactPhones(contactPhones.filter((_, i) => i !== index))
  }

  const [contactPhones, setContactPhones] = useState<string[]>([])
  const [newPhone, setNewPhone] = useState("")
  const [documentNumber, setDocumentNumber] = useState("")
  const [brand, setBrand] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [coverUrl, setCoverUrl] = useState("")
  const [faviconUrl, setFaviconUrl] = useState("")
  const [primaryColor, setPrimaryColor] = useState("")
  const [branches, setBranches] = useState<any[]>([])

  const [errors, setErrors] = useState<Partial<Record<keyof OrganizationInput, string>>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle")

  const [status, setStatus] = useState("active")
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  const [members, setMembers] = useState<any[]>([])
  const [isMembersDbError, setIsMembersDbError] = useState(false)

  useEffect(() => {
    async function loadOrgDetails() {
      if (!selectedOrganization?.id) {
        navigate("/dashboard/organizations")
        return
      }
      setIsLoading(true)
      try {
        const data = await api.organizations.get(selectedOrganization.id)

        if (data) {
          setName(data.name || "")
          setType(data.organizationType || "")
          let loadedEmails: string[] = []
          if (Array.isArray(data.emails)) {
            loadedEmails = data.emails.filter(Boolean)
          } else if (typeof data.email === "string") {
            loadedEmails = data.email.split(",").map((e: string) => e.trim()).filter(Boolean)
          }
          setEmails(loadedEmails)
          setSlug(data.slug || "")
          setDescription(data.description || "")
          let loadedPhones: string[] = []
          if (Array.isArray(data.contact_phone)) {
            loadedPhones = data.contact_phone.filter(Boolean)
          } else if (typeof data.contact_phone === "string") {
            loadedPhones = data.contact_phone.split(",").map((p: string) => p.trim()).filter(Boolean)
          }
          setContactPhones(loadedPhones)
          setDocumentNumber(data.document_number || "")
          setBrand(data.brand || "")
          setLogoUrl(data.logoUrl || "")
          setCoverUrl(data.coverUrl || "")
          setFaviconUrl(data.faviconUrl || "")
          setPrimaryColor(data.primaryColor || "")
          setStatus(data.isActive === false ? "inactive" : "active")
        }

        // Fetch branches for this organization
        setBranches(await api.organizations.branches(selectedOrganization.id))

        // Fetch members for this organization
        try {
          const membersData = await api.organizations.members(selectedOrganization.id)
          const uniqueMembers = new Map<string, any>()
          for (const member of membersData || []) {
            const key = member.profile?.authUserId ?? member.profile?.auth_user_id ?? member.profileId ?? member.profile_id ?? member.id
            if (!uniqueMembers.has(key)) uniqueMembers.set(key, member)
          }
          let list = [...uniqueMembers.values()]
          if (user && !list.some((m: any) => isCurrentMember(m, user.id))) {
            list = [
              {
                id: `owner-fallback-${user.id}`,
                role: "Owner",
                is_active: true,
                profile_id: user.id,
                profile: {
                  id: user.id,
                  first_name: user.full_name?.split(" ")[0] || "",
                  last_name: user.full_name?.split(" ").slice(1).join(" ") || "",
                  email: user.email,
                  avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.full_name || user.email || "U")}`
                }
              },
              ...list
            ]
          }
          setMembers(list)
          setIsMembersDbError(false)
        } catch (mErr) {
          console.warn("Failed to fetch members, using fallback. Error details:", mErr)
          // Fallback member (current user)
          if (user) {
            const storedKey = `mock_members_${selectedOrganization.id}`
            const stored = localStorage.getItem(storedKey)
            if (stored) {
              let list = JSON.parse(stored)
              if (!list.some((m: any) => isCurrentMember(m, user.id))) {
                list = [
                  {
                    id: "fallback-member-id",
                    role: "Owner",
                    is_active: true,
                    profile_id: user.id,
                    profile: {
                      id: user.id,
                      first_name: user.full_name?.split(" ")[0] || "",
                      last_name: user.full_name?.split(" ").slice(1).join(" ") || "",
                      email: user.email,
                      avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.full_name || user.email || "U")}`
                    }
                  },
                  ...list
                ]
                localStorage.setItem(storedKey, JSON.stringify(list))
              }
              setMembers(list)
            } else {
              const defaultMember = [
                {
                  id: "fallback-member-id",
                  role: "Owner",
                  is_active: true,
                  profile_id: user.id,
                  profile: {
                    id: user.id,
                    first_name: user.full_name?.split(" ")[0] || "",
                    last_name: user.full_name?.split(" ").slice(1).join(" ") || "",
                    email: user.email,
                    avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.full_name || user.email || "U")}`
                  }
                }
              ]
              setMembers(defaultMember)
              localStorage.setItem(storedKey, JSON.stringify(defaultMember))
            }
          }
        }
      } catch (err) {
        console.error("Error loading organization settings:", err)
        toast.error("Error al cargar la información de la organización.")
      } finally {
        setIsLoading(false)
      }
    }

    loadOrgDetails()
  }, [selectedOrganization?.id, navigate])

  // Real-time slug availability check (excluding current organization)
  useEffect(() => {
    if (!slug || slug.length < 3 || !selectedOrganization?.id) {
      setSlugStatus("idle")
      return
    }

    setSlugStatus("checking")
    const timer = setTimeout(async () => {
      try {
        const data = (await api.organizations.list()).find((org: any) => org.slug === slug && org.id !== selectedOrganization.id)

        if (data) {
          setSlugStatus("taken")
        } else {
          setSlugStatus("available")
        }
      } catch (err) {
        console.error("Error checking slug availability:", err)
        setSlugStatus("idle")
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [slug, selectedOrganization?.id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrganization?.id) return

    setErrors({})
    setIsSubmitting(true)

    let currentEmails = [...emails]
    if (newEmail.trim()) {
      const parts = newEmail.split(/[\s,;]+/).map(p => p.trim()).filter(Boolean)
      const invalidParts = parts.filter(p => !/\S+@\S+\.\S+/.test(p))
      if (invalidParts.length > 0) {
        toast.error(`Uno o más correos en el campo de entrada son inválidos: ${invalidParts.join(", ")}`)
        setIsSubmitting(false)
        return
      }
      parts.forEach(p => {
        if (!currentEmails.includes(p)) {
          currentEmails.push(p)
        }
      })
      setEmails(currentEmails)
      setNewEmail("")
    }

    let currentPhones = [...contactPhones]
    if (newPhone.trim()) {
      const parts = newPhone.split(/[\s,;]+/).map(p => p.trim()).filter(Boolean)
      parts.forEach(p => {
        if (!currentPhones.includes(p)) {
          currentPhones.push(p)
        }
      })
      setContactPhones(currentPhones)
      setNewPhone("")
    }

    const validation = organizationSchema.safeParse({
      name,
      type,
      email: currentEmails.join(", "),
      slug,
      description,
      contactPhone: currentPhones.join(", "),
      documentNumber,
      brand,
      logoUrl,
      coverUrl,
      faviconUrl,
      primaryColor,
    })

    if (!validation.success) {
      const fieldErrors: Partial<Record<keyof OrganizationInput, string>> = {}
      validation.error.issues.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as keyof OrganizationInput] = err.message
        }
      })
      setErrors(fieldErrors)
      setIsSubmitting(false)
      toast.error("Por favor, corrige los errores en el formulario.")
      return
    }

    if (slugStatus === "taken") {
      toast.error("El slug seleccionado ya está en uso por otra organización.")
      setIsSubmitting(false)
      return
    }

    try {
      await api.organizations.update(selectedOrganization.id, { name, organizationType: type, emails: currentEmails, slug, description: description || null, contactPhones: currentPhones, documentNumber: documentNumber || null, brand: brand || null, logoUrl: logoUrl || null, coverUrl: coverUrl || null, faviconUrl: faviconUrl || null, primaryColor: primaryColor || null })

      // Update auth store
      const updatedOrg = {
        ...selectedOrganization,
        name,
        slug,
        description: description || "",
        type,
        organizationType: type,
        logoUrl,
        coverUrl,
        faviconUrl,
      }
      selectOrganization(updatedOrg)

      const updatedList = organizations.map((org) =>
        org.id === selectedOrganization.id ? updatedOrg : org
      )
      setOrganizations(updatedList)

      toast.success("Organización actualizada con éxito")
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || "Error al actualizar la organización. Inténtalo de nuevo.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateVisibility = async (newStatus: string) => {
    if (!selectedOrganization?.id) return
    setIsUpdatingVisibility(true)
    try {
      await api.organizations.update(selectedOrganization.id, { isActive: newStatus === "active" })

      setStatus(newStatus)

      // Update auth store
      const updatedOrg = {
        ...selectedOrganization,
        isActive: newStatus === "active",
      }
      selectOrganization(updatedOrg)

      const updatedList = organizations.map((org) =>
        org.id === selectedOrganization.id ? updatedOrg : org
      )
      setOrganizations(updatedList)

      toast.success(`Visibilidad actualizada a: ${newStatus === "active" ? "Activo" : "Inactivo"}`)
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || "Error al actualizar la visibilidad.")
    } finally {
      setIsUpdatingVisibility(false)
    }
  }

  const handleDeleteOrganization = async () => {
    if (!selectedOrganization?.id) return
    setIsDeleting(true)
    try {
      const orgId = selectedOrganization.id

      await api.organizations.remove(orgId)

      // 5. Update auth store
      const updatedList = organizations.filter((org) => org.id !== orgId)
      setOrganizations(updatedList)

      if (updatedList.length > 0) {
        selectOrganization(updatedList[0])
      } else {
        selectOrganization(null)
      }

      toast.success("Organización eliminada permanentemente")
      setIsDeleteModalOpen(false)
      setDeleteConfirmName("")
      navigate("/dashboard/organizations", { replace: true })
    } catch (err: any) {
      console.error("Error deleting organization:", err)
      toast.error(err.message || "Error al eliminar la organización.")
    } finally {
      setIsDeleting(false)
    }
  }





  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 w-full animate-pulse space-y-6">
        <div className="space-y-2 mb-10">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted rounded" />
        </div>
        <div className="border border-border rounded-xl bg-card p-6 space-y-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col md:flex-row md:items-center justify-between py-4 border-b border-border gap-4">
              <div className="md:w-1/3 space-y-1">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted/60 rounded w-3/4" />
              </div>
              <div className="md:w-2/3 max-w-md w-full">
                <div className="h-10 bg-muted rounded w-full" />
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-4">
            <div className="h-10 w-24 bg-muted rounded" />
            <div className="h-10 w-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 w-full">
      <div className="mb-10">
        <PageHeader
          title="Ajustes de la Organización"
          description="Administra los datos públicos, comerciales y de contacto de tu organización."
        />
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          {/* Name Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label htmlFor="org-name" className="text-sm font-medium text-foreground">
                Nombre de la Organización <span className="text-destructive">*</span>
              </label>
              <p className="text-xs text-muted-foreground">El nombre comercial o institucional de tu espacio de trabajo.</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full">
              <Input
                id="org-name"
                type="text"
                placeholder="Ej. Tech Latam, Eventos Globales"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
                disabled={isSubmitting}
              />
              {errors.name && (
                <p className="text-xs text-destructive mt-1.5 font-medium">{errors.name}</p>
              )}
            </div>
          </div>

          {/* Type Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label htmlFor="org-type" className="text-sm font-medium text-foreground">
                Tipo de Organización <span className="text-destructive">*</span>
              </label>
              <p className="text-xs text-muted-foreground">El sector o enfoque al que pertenece (ej. Educación, Tecnología).</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full">
              <Input
                id="org-type"
                type="text"
                placeholder="Ej. Tecnología, Educación, Corporación"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={errors.type ? "border-destructive focus-visible:ring-destructive" : ""}
                disabled={isSubmitting}
              />
              {errors.type && (
                <p className="text-xs text-destructive mt-1.5 font-medium">{errors.type}</p>
              )}
            </div>
          </div>

          {/* Email Row (Optional) */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label className="text-sm font-medium text-foreground">
                Correos Electrónicos
              </label>
              <p className="text-xs text-muted-foreground">Correos oficiales para notificaciones y contacto de eventos.</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Ej. contacto@miorganizacion.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value.trim())}
                  disabled={isSubmitting}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail(e as any))}
                />
                <Button type="button" variant="outline" onClick={addEmail} disabled={isSubmitting} className="cursor-pointer">
                  Agregar
                </Button>
              </div>
              {/* Render email chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {emails.map((email, index) => (
                  <span
                    key={index}
                    className="bg-muted border border-border text-foreground text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium animate-in zoom-in-95 duration-100"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeEmail(index)}
                      className="text-muted-foreground hover:text-destructive cursor-pointer outline-none"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {emails.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">No hay correos registrados.</span>
                )}
              </div>
              {errors.email && (
                <p className="text-xs text-destructive mt-1.5 font-medium">{errors.email}</p>
              )}
            </div>
          </div>

          {/* Slug Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label htmlFor="org-slug" className="text-sm font-medium text-foreground">
                Identificador URL (Slug) <span className="text-destructive">*</span>
              </label>
              <p className="text-xs text-muted-foreground">Dirección única para acceder a tu panel de eventos.</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full">
              <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/50">
                <span className="bg-muted px-3 border-r border-border text-xs text-muted-foreground flex items-center font-mono select-none">
                  /
                </span>
                <input
                  id="org-slug"
                  type="text"
                  placeholder="ej-org"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  className="flex-1 px-3 py-2 text-sm bg-transparent border-0 outline-none text-foreground"
                  disabled={isSubmitting}
                />
              </div>
              {slug.length >= 3 && (
                <div className="flex items-center gap-1.5 mt-2 text-xs font-medium">
                  {slugStatus === "checking" && (
                    <span className="text-muted-foreground animate-pulse">Verificando disponibilidad...</span>
                  )}
                  {slugStatus === "available" && (
                    <span className="text-emerald-600 dark:text-emerald-500 flex items-center gap-1">
                      <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                      {slug} está disponible.
                    </span>
                  )}
                  {slugStatus === "taken" && (
                    <span className="text-destructive flex items-center gap-1">
                      <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                      </svg>
                      {slug} ya está en uso.
                    </span>
                  )}
                </div>
              )}
              {errors.slug && (
                <p className="text-xs text-destructive mt-1.5 font-medium">{errors.slug}</p>
              )}
            </div>
          </div>

          {/* Description Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label htmlFor="org-desc" className="text-sm font-medium text-foreground">Descripción</label>
              <p className="text-xs text-muted-foreground">Una reseña corta del propósito o actividades de tu organización.</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full">
              <textarea
                id="org-desc"
                rows={4}
                placeholder="Describe el enfoque de los eventos que organiza tu espacio de trabajo..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md outline-none focus:ring-2 focus:ring-ring/50 text-foreground"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Brand Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label htmlFor="org-brand" className="text-sm font-medium text-foreground">Marca comercial</label>
              <p className="text-xs text-muted-foreground">Nombre corto o marca con la que se conoce a la organización. (Ej. TechLatam)</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full">
              <Input
                id="org-brand"
                type="text"
                placeholder="Ej. TechLatam"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Logo URL Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label className="text-sm font-medium text-foreground">Logotipo de la Organización</label>
              <p className="text-xs text-muted-foreground">Imagen representativa de la organización.</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full">
              <MediaUploader
                value={logoUrl}
                onChange={setLogoUrl}
                variant="square"
                placeholder="Arrastra tu logotipo aquí, o selecciona un archivo"
                folder={`organizations/${organizationId}/branding/logo`}
                identifier="logo"
                assetTarget={{ organizationId, type: "organizations/logo", resourceId: organizationId }}
                onR2UploadComplete={async (publicUrl) => {
                  await api.organizations.update(organizationId, { logoUrl: publicUrl })
                  const updatedOrganization = { ...selectedOrganization!, logoUrl: publicUrl }
                  selectOrganization(updatedOrganization)
                  setOrganizations(organizations.map((org) => org.id === organizationId ? updatedOrganization : org))
                  toast.success("Logotipo guardado correctamente")
                }}
              />
              {errors.logoUrl && (
                <p className="text-xs text-destructive mt-1.5 font-medium">{errors.logoUrl}</p>
              )}
            </div>
          </div>

          {/* Cover URL Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label className="text-sm font-medium text-foreground">Portada / Banner</label>
              <p className="text-xs text-muted-foreground">Banner de fondo que se mostrará en los eventos y portal.</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full">
              <MediaUploader
                value={coverUrl}
                onChange={setCoverUrl}
                variant="banner"
                placeholder="Arrastra tu banner de portada aquí, o selecciona un archivo"
                folder={`organizations/${organizationId}/branding/cover`}
                identifier="cover"
                assetTarget={{ organizationId, type: "organizations/cover", resourceId: organizationId }}
                onR2UploadComplete={async (publicUrl) => {
                  await api.organizations.update(organizationId, { coverUrl: publicUrl })
                  const updatedOrganization = { ...selectedOrganization!, coverUrl: publicUrl }
                  selectOrganization(updatedOrganization)
                  setOrganizations(organizations.map((org) => org.id === organizationId ? updatedOrganization : org))
                  toast.success("Portada guardada correctamente")
                }}
              />
              {errors.coverUrl && (
                <p className="text-xs text-destructive mt-1.5 font-medium">{errors.coverUrl}</p>
              )}
            </div>
          </div>

          {/* Favicon URL Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label className="text-sm font-medium text-foreground">Favicon</label>
              <p className="text-xs text-muted-foreground">Icono de página web pequeño (generalmente 1:1).</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full">
              <MediaUploader
                value={faviconUrl}
                onChange={setFaviconUrl}
                variant="favicon"
                placeholder="Arrastra tu favicon aquí, o selecciona un archivo"
                folder={`organizations/${organizationId}/branding/favicon`}
                identifier="favicon"
                assetTarget={{ organizationId, type: "organizations/favicon", resourceId: organizationId }}
                onR2UploadComplete={async (publicUrl) => {
                  await api.organizations.update(organizationId, { faviconUrl: publicUrl })
                  const updatedOrganization = { ...selectedOrganization!, faviconUrl: publicUrl }
                  selectOrganization(updatedOrganization)
                  setOrganizations(organizations.map((org) => org.id === organizationId ? updatedOrganization : org))
                  toast.success("Favicon guardado correctamente")
                }}
              />
              {errors.faviconUrl && (
                <p className="text-xs text-destructive mt-1.5 font-medium">{errors.faviconUrl}</p>
              )}
            </div>
          </div>

          {/* Primary Color Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label htmlFor="org-color" className="text-sm font-medium text-foreground">Color Primario de Marca</label>
              <p className="text-xs text-muted-foreground">Código de color hexadecimal representativo de la marca. (Ej. #7C3AED)</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full font-mono">
              <Input
                id="org-color"
                type="text"
                placeholder="Ej. #7C3AED"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className={errors.primaryColor ? "border-destructive focus-visible:ring-destructive" : ""}
                disabled={isSubmitting}
              />
              {errors.primaryColor && (
                <p className="text-xs text-destructive mt-1.5 font-medium">{errors.primaryColor}</p>
              )}
            </div>
          </div>

          {/* Phone Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label className="text-sm font-medium text-foreground">Teléfonos de Contacto</label>
              <p className="text-xs text-muted-foreground">Números de teléfono oficiales de la organización.</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Ej. +51 987654321"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value.replace(/[^0-9+\s-]/g, ""))}
                  disabled={isSubmitting}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhone(e as any))}
                />
                <Button type="button" variant="outline" onClick={addPhone} disabled={isSubmitting} className="cursor-pointer">
                  Agregar
                </Button>
              </div>
              {/* Render phone chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {contactPhones.map((phone, index) => (
                  <span
                    key={index}
                    className="bg-muted border border-border text-foreground text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium animate-in zoom-in-95 duration-100"
                  >
                    {phone}
                    <button
                      type="button"
                      onClick={() => removePhone(index)}
                      className="text-muted-foreground hover:text-destructive cursor-pointer outline-none"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {contactPhones.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">No hay teléfonos registrados.</span>
                )}
              </div>
            </div>
          </div>
          {/* Document Number Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between p-6 gap-4 border-b border-border">
            <div className="md:w-1/3 space-y-1">
              <label htmlFor="org-doc" className="text-sm font-medium text-foreground">Número de Documento Fiscal</label>
              <p className="text-xs text-muted-foreground">Identificación tributaria legal (RUC, NIT, RFC, etc.).</p>
            </div>
            <div className="md:w-2/3 max-w-md w-full">
              <Input
                id="org-doc"
                type="text"
                placeholder="Ej. 20123456789"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Actions Row */}
          <div className="bg-muted/10 px-6 py-4 flex justify-end gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="font-medium px-5 transition-colors"
            >
              {isSubmitting ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </div>
      </form>

      {/* Branches Section */}
      <div className="mt-10 space-y-4">
        {/* Section title above card container matching the image */}
        <h3 className="text-xl tracking-tight text-foreground font-sans">
          Sedes de la organización
        </h3>

        {/* Card Container faithful to the mockup */}
        <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
          {/* Header Row */}
          <div className="p-6 flex items-center justify-between gap-4 border-b border-border bg-card">
            <div className="space-y-1">
              <h4 className="font-semibold text-base text-foreground font-sans">
                Acceso a Sedes
              </h4>
              <p className="text-xs text-muted-foreground font-sans">
                Todas las sucursales, oficinas y ubicaciones físicas autorizadas en esta organización.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard/settings/branches")}
              className="border border-border hover:bg-muted text-foreground px-3.5 py-2 rounded-lg text-xs font-semibold select-none transition-colors cursor-pointer outline-none font-sans"
            >
              Gestionar sedes
            </button>
          </div>

          {/* List of sedes like members in mockup */}
          {branches.length > 0 ? (
            <div className="w-full">
              {/* Sub-Header Column Labels */}
              <div className="grid grid-cols-2 px-6 py-3 border-b border-border bg-muted/15 text-[10px] font-bold tracking-wider text-muted-foreground/80 font-mono uppercase">
                <div>Sede</div>
                <div className="text-right">Ubicación / Rol</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border/60">
                {branches.map((branch) => (
                  <div key={branch.id} className="grid grid-cols-2 px-6 py-4 items-center text-sm hover:bg-muted/5 transition-colors font-sans">
                    {/* Left details */}
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{branch.name}</span>
                      {branch.is_main && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary font-bold uppercase tracking-wider font-sans">
                          Principal
                        </span>
                      )}
                      {!branch.is_active && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted border border-border text-muted-foreground font-bold uppercase tracking-wider font-sans">
                          Inactivo
                        </span>
                      )}
                    </div>

                    {/* Right details */}
                    <div className="text-right text-muted-foreground text-xs font-normal">
                      {branch.address ? (
                        <span>
                          {branch.address}
                          {(branch.district || branch.province) && " ("}
                          {[branch.district, branch.province].filter(Boolean).join(", ")}
                          {(branch.district || branch.province) && ")"}
                        </span>
                      ) : (
                        <span>{[branch.district, branch.province, branch.department].filter(Boolean).join(", ") || "Sin ubicación"}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground italic font-sans">
              No hay sedes registradas para esta organización. Haz clic en "Gestionar sedes" para añadir una.
            </div>
          )}
        </div>
      </div>

      {/* Miembros del equipo Section */}
      <div className="mt-10 space-y-4 font-sans animate-in fade-in duration-300">
        <h3 className="text-xl tracking-tight text-foreground font-sans">
          Miembros del equipo
        </h3>

        {/* Database notice/warning if table does not exist */}
        {isMembersDbError && (
          <div className="p-4 border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 rounded-xl space-y-3 text-xs leading-relaxed">
            <div className="flex items-center gap-2 font-semibold">
              <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Tabla de miembros no configurada (Modo Demo Activo)
            </div>
            <p>
              Los miembros se gestionan mediante el backend de la plataforma.
            </p>
          </div>
        )}

        <div className="mb-6 border border-border rounded-xl bg-card overflow-hidden shadow-sm">
          <div className="p-6 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="font-semibold text-base text-foreground font-sans">Integraciones</h4>
              <p className="text-xs text-muted-foreground font-sans">
                Correo, Zoom, Facebook Live, Asistencia, Certificados y Telegram propios de esta institución.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard/settings/integrations")}
              className="border border-border hover:bg-muted text-foreground px-3.5 py-2 rounded-lg text-xs font-semibold select-none transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring font-sans"
            >
              Configurar integraciones
            </button>
          </div>
        </div>

        {/* Card Container faithful to the mockup */}
        <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
          {/* Header Row */}
          <div className="p-6 flex items-center justify-between gap-4 border-b border-border bg-card">
            <div className="space-y-1">
              <h4 className="font-semibold text-base text-foreground font-sans">
                Acceso a Miembros
              </h4>
              <p className="text-xs text-muted-foreground font-sans">
                Administra los miembros autorizados en esta organización y sus respectivos roles de acceso.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard/settings/members")}
              className="border border-border hover:bg-muted text-foreground px-3.5 py-2 rounded-lg text-xs font-semibold select-none transition-colors cursor-pointer outline-none font-sans"
            >
              Gestionar miembros
            </button>
          </div>

          {/* List of Members */}
          {members.length > 0 ? (
            <div className="w-full">
              {/* Sub-Header Column Labels */}
              <div className="grid grid-cols-2 px-6 py-3 border-b border-border bg-muted/15 text-[10px] font-bold tracking-wider text-muted-foreground/80 font-mono uppercase">
                <div>Miembro</div>
                <div className="text-right">Rol</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border/60">
                {members.map((member) => (
                  <div key={member.id} className="grid grid-cols-2 px-6 py-4 items-center text-sm hover:bg-muted/5 transition-colors font-sans">
                    {/* Left details: Member Profile */}
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="size-8 rounded-full overflow-hidden border border-border shrink-0 bg-muted/40">
                        {member.profile?.avatar_url ? (
                          <img src={member.profile.avatar_url} alt="Avatar" className="size-full object-cover" />
                        ) : (
                          <div className="size-full flex items-center justify-center bg-primary/10 text-primary font-bold text-xs">
                            {(member.profile?.first_name || member.profile?.email || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="grid leading-tight min-w-0">
                        <span className="font-medium text-foreground truncate">
                          {member.profile?.first_name || member.profile?.last_name
                            ? `${member.profile.first_name || ""} ${member.profile.last_name || ""}`.trim()
                            : member.profile?.email?.split("@")[0]}
                        </span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs text-muted-foreground truncate">{member.profile?.email}</span>
                          {isCurrentMember(member, user?.id) && (
                            <span className="text-[8px] font-bold tracking-wider uppercase px-1 rounded bg-muted text-muted-foreground select-none shrink-0 font-sans">
                              TÚ
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right details: Role */}
                    <div className="text-right text-muted-foreground text-xs font-normal">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted border border-border text-foreground capitalize select-none">
                        {getRoleLabel(member.role)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground italic font-sans">
              No hay miembros registrados para esta organización. Haz clic en "Gestionar miembros" para añadir uno.
            </div>
          )}

          {/* Bottom count */}
          <div className="px-6 py-3.5 bg-muted/5 border-t border-border/60 text-xs text-muted-foreground font-medium">
            {members.length} {members.length === 1 ? "miembro" : "miembros"}
          </div>
        </div>
      </div>

      {/* Visibilidad Section */}
      <div className="mt-10 space-y-4 font-sans">
        <h3 className="text-xl tracking-tight text-foreground">
          Visibilidad de la organización
        </h3>
        <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-semibold text-base text-foreground">
              Estado de publicación
            </h4>
            <p className="text-xs text-muted-foreground max-w-lg">
              Si la organización está inactiva, sus eventos no serán visibles al público en general y no se podrán vender entradas.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status indicators */}
            <div className="flex items-center gap-2 mr-2">
              <span className={`h-2.5 w-2.5 rounded-full ${status === "active" ? "bg-emerald-500 animate-pulse" : "bg-destructive"}`} />
              <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                {status === "active" ? "ACTIVO" : "INACTIVO"}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={isUpdatingVisibility}
              onClick={() => handleUpdateVisibility(status === "active" ? "inactive" : "active")}
              className={`cursor-pointer text-xs font-semibold ${status === "active"
                ? "border-destructive hover:bg-destructive/10 text-destructive"
                : "border-emerald-500 hover:bg-emerald-50 text-emerald-600 dark:hover:bg-emerald-950/20 dark:text-emerald-500"
                }`}
            >
              {status === "active" ? "Desactivar" : "Activar"}
            </Button>
          </div>
        </div>
      </div>

      {/* Danger Zone Section */}
      <div className="mt-10 space-y-4 font-sans">
        <h3 className="text-xl tracking-tight text-destructive font-medium">
          Zona de Peligro
        </h3>
        <div className="border border-destructive/20 rounded-xl bg-destructive/5 overflow-hidden shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-semibold text-base text-destructive">
              Eliminar esta organización
            </h4>
            <p className="text-xs text-muted-foreground max-w-lg">
              Una vez confirmada la eliminación de la organización, no se podrá recuperar ningún dato. Se borrarán todas las sedes y eventos.
            </p>
          </div>
          <div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setIsDeleteModalOpen(true)}
              className="cursor-pointer font-semibold shadow-sm"
            >
              Eliminar Organización
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-xl max-w-md w-full shadow-2xl p-6 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-destructive font-sans">
                ¿Estás absolutamente seguro?
              </h3>
              <p className="text-sm text-muted-foreground font-sans">
                Esta acción <strong className="text-foreground">no se puede deshacer</strong>. Se eliminará permanentemente la organización
                {" "}<strong className="text-foreground font-semibold">{name}</strong>, todas sus sedes, eventos y los archivos subidos al storage.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm-org-name" className="text-xs text-muted-foreground font-medium block">
                Escribe <span className="font-semibold text-foreground select-none">{name}</span> para confirmar la eliminación:
              </label>
              <Input
                id="confirm-org-name"
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder="Nombre de la organización"
                className="border-destructive/50 focus-visible:ring-destructive"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDeleteModalOpen(false)
                  setDeleteConfirmName("")
                }}
                disabled={isDeleting}
                className="cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteConfirmName !== name || isDeleting}
                onClick={handleDeleteOrganization}
                className="cursor-pointer font-semibold"
              >
                {isDeleting ? "Eliminando..." : "Sí, eliminar definitivamente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
