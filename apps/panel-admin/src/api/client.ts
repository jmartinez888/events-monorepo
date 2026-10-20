const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "")

if (!API_URL) {
  throw new Error("VITE_API_URL no está configurada. Define la URL del backend en el archivo .env del frontend.")
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  constructor(status: number, message: string, code?: string) { super(message); this.status = status; this.code = code }
}

export interface SessionTokens { accessToken: string; refreshToken: string }
export interface AccountSecurity { id: string; email: string; role: string; isActive: boolean; emailVerified: boolean; twoFactorEnabled: boolean; twoFactorMethod: "TOTP" | "EMAIL" | null; lastLoginAt: string | null; recoveryCodesLeft?: number }
/** OK abre sesión; VERIFY_EMAIL y MFA_REQUIRED piden un código con el pendingToken. */
export type LoginOutcome =
  | ({ status: "OK"; user: any } & SessionTokens)
  | { status: "VERIFY_EMAIL"; pendingToken: string; email: string }
  | { status: "MFA_REQUIRED"; pendingToken: string; email: string; method: "TOTP" | "EMAIL" }
export type TwoFactorEnabled = SessionTokens & { recoveryCodes: string[]; account: AccountSecurity }

/** Guarda tokens nuevos tras una operación que cambia la versión de sesión. */
export function storeSessionTokens(tokens: SessionTokens) {
  localStorage.setItem("events-api-access-token", tokens.accessToken)
  localStorage.setItem("events-api-refresh-token", tokens.refreshToken)
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  // El navegador debe definir el boundary al enviar FormData para las cargas multimedia.
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json")
  const token = localStorage.getItem("events-api-access-token")
  if (token) headers.set("Authorization", `Bearer ${token}`)
  let response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" })
  if (response.status === 401 && path !== "/auth/refresh") {
    const refreshToken = localStorage.getItem("events-api-refresh-token")
    if (refreshToken) {
      const refreshResponse = await fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }), credentials: "include" })
      const refreshed = await refreshResponse.json().catch(() => null)
      if (refreshResponse.ok && refreshed?.accessToken) {
        localStorage.setItem("events-api-access-token", refreshed.accessToken)
        localStorage.setItem("events-api-refresh-token", refreshed.refreshToken)
        headers.set("Authorization", `Bearer ${refreshed.accessToken}`)
        response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" })
      }
    }
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(". ") : body?.message || "No se pudo completar la operación."
    throw new ApiError(response.status, message, body?.code)
  }
  return body as T
}

export const api = {
  publicEvents: {
    list: (organizationSlug: string) => apiFetch<any>(`/public/organizations/${encodeURIComponent(organizationSlug)}/events`),
    get: (organizationSlug: string, eventId: string) => apiFetch<any>(`/public/organizations/${encodeURIComponent(organizationSlug)}/events/${encodeURIComponent(eventId)}`),
  },
  auth: {
    login: (email: string, password: string) => apiFetch<LoginOutcome>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    register: (data: { email: string; password: string; firstName: string; lastName: string }) => apiFetch<LoginOutcome>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    verifyEmail: (pendingToken: string, code: string) => apiFetch<LoginOutcome>("/auth/verify-email", { method: "POST", body: JSON.stringify({ pendingToken, code }) }),
    resendCode: (pendingToken: string) => apiFetch<{ sent: boolean; expiresInMinutes: number }>("/auth/resend-code", { method: "POST", body: JSON.stringify({ pendingToken }) }),
    completeTwoFactor: (pendingToken: string, code: string) => apiFetch<LoginOutcome>("/auth/login/2fa", { method: "POST", body: JSON.stringify({ pendingToken, code }) }),
    me: () => apiFetch<AccountSecurity>("/auth/me"),
    securityEvents: () => apiFetch<Array<{ id: string; action: string; ip: string | null; createdAt: string }>>("/auth/security-events"),
    changePassword: (currentPassword: string, newPassword: string) => apiFetch<SessionTokens>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
    logoutAll: () => apiFetch<{ revoked: boolean }>("/auth/logout-all", { method: "POST" }),
    beginTotp: () => apiFetch<{ secret: string; otpauthUri: string }>("/auth/2fa/totp/setup", { method: "POST" }),
    enableTotp: (code: string) => apiFetch<TwoFactorEnabled>("/auth/2fa/totp/enable", { method: "POST", body: JSON.stringify({ code }) }),
    beginEmailTwoFactor: () => apiFetch<{ sent: boolean; email: string; expiresInMinutes: number }>("/auth/2fa/email/setup", { method: "POST" }),
    enableEmailTwoFactor: (code: string) => apiFetch<TwoFactorEnabled>("/auth/2fa/email/enable", { method: "POST", body: JSON.stringify({ code }) }),
    disableTwoFactor: (password: string) => apiFetch<SessionTokens & { account: AccountSecurity }>("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password }) }),
    regenerateRecoveryCodes: (password: string) => apiFetch<{ recoveryCodes: string[] }>("/auth/2fa/recovery-codes", { method: "POST", body: JSON.stringify({ password }) }),
    resetUserTwoFactor: (id: string) => apiFetch<{ reset: boolean }>(`/auth/users/${id}/reset-2fa`, { method: "POST" }),
    refresh: (refreshToken: string) => apiFetch<{ accessToken: string; refreshToken: string }>("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }),
    forgotPassword: (email: string) => apiFetch<any>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
    resetPassword: (token: string, password: string) => apiFetch<any>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
    adminCreate: (data: any) => apiFetch<any>("/auth/admin-create", { method: "POST", body: JSON.stringify(data) }),
    users: () => apiFetch<any[]>("/auth/users"),
    updateUser: (id: string, data: any) => apiFetch<any>(`/auth/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    resetUserPassword: (id: string) => apiFetch<{ accepted: boolean; emailSent: boolean }>(`/auth/users/${id}/reset-password`, { method: "POST" }),
    removeUser: (id: string) => apiFetch<any>(`/auth/users/${id}`, { method: "DELETE" }),
  },
  profiles: {
    list: (organizationId?: string) => apiFetch<any[]>(`/profiles${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ""}`),
    create: (data: any) => apiFetch<any>("/profiles", { method: "POST", body: JSON.stringify(data) }),
    get: (id: string) => apiFetch<any>(`/profiles/${id}`),
    update: (id: string, data: Record<string, unknown>) => apiFetch<any>(`/profiles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => apiFetch<any>(`/profiles/${id}`, { method: "DELETE" }),
    education: (id: string) => apiFetch<any[]>(`/profiles/${id}/education`),
    addEducation: (id: string, data: any) => apiFetch<any>(`/profiles/${id}/education`, { method: "POST", body: JSON.stringify(data) }),
    updateEducation: (id: string, data: any) => apiFetch<any>(`/profiles/education/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeEducation: (id: string) => apiFetch<any>(`/profiles/education/${id}`, { method: "DELETE" }),
    employment: (id: string) => apiFetch<any[]>(`/profiles/${id}/employment`),
    addEmployment: (id: string, data: any) => apiFetch<any>(`/profiles/${id}/employment`, { method: "POST", body: JSON.stringify(data) }),
    updateEmployment: (id: string, data: any) => apiFetch<any>(`/profiles/employment/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeEmployment: (id: string) => apiFetch<any>(`/profiles/employment/${id}`, { method: "DELETE" }),
    certifications: (id: string) => apiFetch<any[]>(`/profiles/${id}/certifications`),
    addCertification: (id: string, data: any) => apiFetch<any>(`/profiles/${id}/certifications`, { method: "POST", body: JSON.stringify(data) }),
    updateCertification: (id: string, data: any) => apiFetch<any>(`/profiles/certifications/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeCertification: (id: string) => apiFetch<any>(`/profiles/certifications/${id}`, { method: "DELETE" }),
  },
  organizations: {
    list: () => apiFetch<any[]>("/organizations"),
    get: (id: string) => apiFetch<any>(`/organizations/${id}`),
    access: (id: string) => apiFetch<{ organizationId: string; role: string; permissions: string[] }>(`/organizations/${id}/access`),
    create: (data: any) => apiFetch<any>("/organizations", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch<any>(`/organizations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => apiFetch<any>(`/organizations/${id}`, { method: "DELETE" }),
    branches: (id: string) => apiFetch<any[]>(`/organizations/${id}/branches`),
    addBranch: (id: string, data: any) => apiFetch<any>(`/organizations/${id}/branches`, { method: "POST", body: JSON.stringify(data) }),
    updateBranch: (id: string, data: any) => apiFetch<any>(`/organizations/branches/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeBranch: (id: string) => apiFetch<any>(`/organizations/branches/${id}`, { method: "DELETE" }),
    members: (id: string) => apiFetch<any[]>(`/organizations/${id}/members`),
    addMember: (id: string, data: any) => apiFetch<any>(`/organizations/${id}/members`, { method: "POST", body: JSON.stringify(data) }),
    inviteMember: (id: string, data: { email: string; role: string }) => apiFetch<any>(`/organizations/${id}/invitations`, { method: "POST", body: JSON.stringify(data) }),
    updateMember: (id: string, data: any) => apiFetch<any>(`/organizations/members/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeMember: (id: string) => apiFetch<any>(`/organizations/members/${id}`, { method: "DELETE" }),
    updateSubscription: (id: string, data: { plan?: "FREE" | "PREMIUM" | "ENTERPRISE"; status?: string }) => apiFetch<any>(`/organizations/${id}/subscription`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  events: {
    list: (organizationId?: string) => apiFetch<any[]>(`/events${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ""}`),
    get: (id: string) => apiFetch<any>(`/events/${id}`),
    create: (data: any) => apiFetch<any>("/events", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch<any>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => apiFetch<any>(`/events/${id}`, { method: "DELETE" }),
    attendeeExport: (id: string) => apiFetch<any[]>(`/events/${id}/attendees/export`),
    attendees: (id: string, search = "", page = 1, limit = 20) => apiFetch<{ items: any[]; total: number; page: number; limit: number }>(`/events/${id}/attendees?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    setup: (id: string) => apiFetch<any>(`/events/${id}/setup`),
    updateSetup: (id: string, data: any) => apiFetch<any>(`/events/${id}/setup`, { method: "PATCH", body: JSON.stringify(data) }),
    completeSetup: (id: string) => apiFetch<any>(`/events/${id}/setup/complete`, { method: "POST" }),
    inheritSpeakers: (id: string, data: { sourceEventId: string; targetEditionId: string }) => apiFetch<{ inherited: number }>(`/events/${id}/inherit-speakers`, { method: "POST", body: JSON.stringify(data) }),
    contacts: (id: string) => apiFetch<any[]>(`/events/${id}/contacts`),
    addContact: (id: string, data: any) => apiFetch<any>(`/events/${id}/contacts`, { method: "POST", body: JSON.stringify(data) }),
    updateContact: (id: string, data: any) => apiFetch<any>(`/events/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeContact: (id: string) => apiFetch<any>(`/events/contacts/${id}`, { method: "DELETE" }),
  },
  editions: {
    list: (eventId: string) => apiFetch<any[]>(`/events/${eventId}/editions`),
    create: (eventId: string, data: any) => apiFetch<any>(`/events/${eventId}/editions`, { method: "POST", body: JSON.stringify(data) }),
    update: (eventId: string, id: string, data: any) => apiFetch<any>(`/events/${eventId}/editions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (eventId: string, id: string) => apiFetch<any>(`/events/${eventId}/editions/${id}`, { method: "DELETE" }),
  },
  media: {
    upload: (file: File, target: { ownerType: "ORGANIZATION" | "EVENT" | "EDITION" | "PROFILE"; ownerId: string; purpose?: "COVER" | "LOGO" | "GALLERY" | "DOCUMENT" | "OTHER"; position?: number; isFeatured?: boolean; orientation?: "LANDSCAPE" | "PORTRAIT" | "SQUARE" | "VIDEO" | "OTHER"; organizationId?: string }) => {
      const form = new FormData()
      form.append("file", file)
      form.append("ownerType", target.ownerType)
      form.append("ownerId", target.ownerId)
      if (target.purpose) form.append("purpose", target.purpose)
      if (target.position !== undefined) form.append("position", String(target.position))
      if (target.isFeatured !== undefined) form.append("isFeatured", String(target.isFeatured))
      if (target.orientation) form.append("orientation", target.orientation)
      if (target.organizationId) form.append("organizationId", target.organizationId)
      return apiFetch<any>("/media/upload", { method: "POST", body: form })
    },
    list: (ownerType: "ORGANIZATION" | "EVENT" | "EDITION" | "PROFILE", ownerId: string) => apiFetch<any[]>(`/media?ownerType=${ownerType}&ownerId=${encodeURIComponent(ownerId)}`),
    library: (organizationId: string) => apiFetch<any[]>(`/media/library/${encodeURIComponent(organizationId)}`),
    attach: (mediaId: string, target: { ownerType: "ORGANIZATION" | "EVENT" | "EDITION" | "PROFILE"; ownerId: string; purpose?: string; position?: number; isFeatured?: boolean }) => apiFetch<any>(`/media/${mediaId}/attach`, { method: "POST", body: JSON.stringify(target) }),
    reorder: (ownerType: "ORGANIZATION" | "EVENT" | "EDITION" | "PROFILE", ownerId: string, items: Array<{ id: string; position: number; isFeatured?: boolean }>) => apiFetch<any[]>("/media/reorder", { method: "POST", body: JSON.stringify({ ownerType, ownerId, items }) }),
    unlink: (linkId: string) => apiFetch<any>(`/media/links/${linkId}`, { method: "DELETE" }),
    remove: (mediaId: string) => apiFetch<any>(`/media/${mediaId}`, { method: "DELETE" }),
  },
  participants: {
    list: (editionId: string) => apiFetch<any[]>(`/editions/${editionId}/participants`),
    add: (editionId: string, profileId: string, roleId?: string) => apiFetch<any>(`/editions/${editionId}/participants`, { method: "POST", body: JSON.stringify({ profileId, roleId }) }),
    addManual: (eventId: string, data: any) => apiFetch<any>(`/events/${eventId}/manual-participants`, { method: "POST", body: JSON.stringify(data) }),
    get: (id: string) => apiFetch<any>(`/participants/${id}`),
    update: (id: string, data: any) => apiFetch<any>(`/participants/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    changeRole: (id: string, roleId: string) => apiFetch<any>(`/participants/${id}/role`, { method: "PATCH", body: JSON.stringify({ roleId }) }),
    setRoles: (id: string, roleIds: string[]) => apiFetch<any>(`/participants/${id}/roles`, { method: "PATCH", body: JSON.stringify({ roleIds }) }),
    remove: (id: string) => apiFetch<any>(`/participants/${id}`, { method: "DELETE" }),
  },
  attendance: {
    list: (eventId: string) => apiFetch<any[]>(`/events/${eventId}/attendance`),
    approveBulk: (eventId: string, participantIds: string[], valid: boolean, note?: string) => apiFetch<{ selected: number; changed: number; batchId: string }>(`/events/${eventId}/attendance/bulk`, { method: "POST", body: JSON.stringify({ participantIds, valid, note }) }),
  },
  certificates: {
    list: (participantId?: string) => apiFetch<any[]>(`/certificates${participantId ? `?participantId=${encodeURIComponent(participantId)}` : ""}`),
    verify: (code: string) => apiFetch<any>(`/certificates/verify/${encodeURIComponent(code)}`),
    issue: (participantId: string, templateId?: string) => apiFetch<any>("/certificates", { method: "POST", body: JSON.stringify({ participantId, templateId }) }),
    templates: () => apiFetch<any[]>("/certificates/templates"),
    createTemplate: (data: any) => apiFetch<any>("/certificates/templates", { method: "POST", body: JSON.stringify(data) }),
    updateTemplate: (id: string, data: any) => apiFetch<any>(`/certificates/templates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeTemplate: (id: string) => apiFetch<any>(`/certificates/templates/${id}`, { method: "DELETE" }),
    logs: (id: string) => apiFetch<any[]>(`/certificates/${id}/logs`),
    addLog: (id: string, data: any) => apiFetch<any>(`/certificates/${id}/logs`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch<any>(`/certificates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  registrationForms: {
    list: (eventId: string) => apiFetch<any[]>(`/events/${eventId}/registration-forms`),
    submissions: (eventId: string) => apiFetch<any[]>(`/events/${eventId}/registration-submissions`),
    get: (id: string) => apiFetch<any>(`/registration-forms/${id}`),
    create: (eventId: string, data: any) => apiFetch<any>(`/events/${eventId}/registration-forms`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch<any>(`/registration-forms/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    setWelcomeTemplate: (id: string, templateId: string | null) => apiFetch<any>(`/registration-forms/${id}/welcome-template`, { method: "PUT", body: JSON.stringify({ templateId }) }),
    makeMain: (id: string) => apiFetch<any>(`/registration-forms/${id}/make-main`, { method: "POST" }),
    remove: (id: string) => apiFetch<any>(`/registration-forms/${id}`, { method: "DELETE" }),
    removeSubmission: (id: string) => apiFetch<any>(`/registration-submissions/${id}`, { method: "DELETE" }),
    public: (slug: string) => apiFetch<any>(`/public/registration-forms/${slug}`),
    submit: (slug: string, data: any) => apiFetch<any>(`/public/registration-forms/${slug}/submissions`, { method: "POST", body: JSON.stringify(data) }),
  },
  content: {
    activities: (editionId: string) => apiFetch<any[]>(`/editions/${editionId}/activities`),
    createActivity: (editionId: string, data: any) => apiFetch<any>(`/editions/${editionId}/activities`, { method: "POST", body: JSON.stringify(data) }),
    updateActivity: (id: string, data: any) => apiFetch<any>(`/activities/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeActivity: (id: string) => apiFetch<any>(`/activities/${id}`, { method: "DELETE" }),
    sessions: (activityId: string) => apiFetch<any[]>(`/activities/${activityId}/sessions`),
    createSession: (activityId: string, data: any) => apiFetch<any>(`/activities/${activityId}/sessions`, { method: "POST", body: JSON.stringify(data) }),
    createSessionForEdition: (editionId: string, data: any) => apiFetch<any>(`/editions/${editionId}/sessions`, { method: "POST", body: JSON.stringify(data) }),
    participantSessions: (participantId: string) => apiFetch<any[]>(`/participants/${participantId}/sessions`),
    updateSession: (id: string, data: any) => apiFetch<any>(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeSession: (id: string) => apiFetch<any>(`/sessions/${id}`, { method: "DELETE" }),
    addSpeaker: (sessionId: string, profileId: string) => apiFetch<any>(`/sessions/${sessionId}/speakers`, { method: "POST", body: JSON.stringify({ profileId }) }),
    removeSessionSpeaker: (id: string) => apiFetch<any>(`/session-speakers/${id}`, { method: "DELETE" }),
    tickets: (editionId: string) => apiFetch<any[]>(`/editions/${editionId}/tickets`),
    createTicket: (editionId: string, data: any) => apiFetch<any>(`/editions/${editionId}/tickets`, { method: "POST", body: JSON.stringify(data) }),
    updateTicket: (id: string, data: any) => apiFetch<any>(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeTicket: (id: string) => apiFetch<any>(`/tickets/${id}`, { method: "DELETE" }),
    thematicLines: (eventId: string) => apiFetch<any[]>(`/events/${eventId}/thematic-lines`),
    createThematicLine: (eventId: string, data: any) => apiFetch<any>(`/events/${eventId}/thematic-lines`, { method: "POST", body: JSON.stringify(data) }),
    updateThematicLine: (id: string, data: any) => apiFetch<any>(`/thematic-lines/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeThematicLine: (id: string) => apiFetch<any>(`/thematic-lines/${id}`, { method: "DELETE" }),
    roles: (mainEventId?: string, editionId?: string) => apiFetch<any[]>(`/participant-roles?${mainEventId ? `mainEventId=${encodeURIComponent(mainEventId)}&` : ""}${editionId ? `editionId=${encodeURIComponent(editionId)}` : ""}`),
    createRole: (data: any) => apiFetch<any>("/participant-roles", { method: "POST", body: JSON.stringify(data) }),
    updateRole: (id: string, data: any) => apiFetch<any>(`/participant-roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeRole: (id: string) => apiFetch<any>(`/participant-roles/${id}`, { method: "DELETE" }),
    speakers: (eventId: string, editionId?: string) => apiFetch<any[]>(`/events/${eventId}/speakers${editionId ? `?editionId=${encodeURIComponent(editionId)}` : ""}`),
    createSpeaker: (eventId: string, data: any) => apiFetch<any>(`/events/${eventId}/speakers`, { method: "POST", body: JSON.stringify(data) }),
    updateSpeaker: (id: string, data: any) => apiFetch<any>(`/speakers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeSpeaker: (id: string) => apiFetch<any>(`/speakers/${id}`, { method: "DELETE" }),
    resources: (sessionId: string) => apiFetch<any[]>(`/sessions/${sessionId}/resources`),
    addResource: (sessionId: string, data: any) => apiFetch<any>(`/sessions/${sessionId}/resources`, { method: "POST", body: JSON.stringify(data) }),
    updateResource: (id: string, data: any) => apiFetch<any>(`/resources/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeResource: (id: string) => apiFetch<any>(`/resources/${id}`, { method: "DELETE" }),
    sessionLines: (sessionId: string) => apiFetch<any[]>(`/sessions/${sessionId}/thematic-lines`),
    addSessionLine: (sessionId: string, thematicLineId: string) => apiFetch<any>(`/sessions/${sessionId}/thematic-lines`, { method: "POST", body: JSON.stringify({ thematicLineId }) }),
    removeSessionLine: (sessionId: string, thematicLineId: string) => apiFetch<any>(`/sessions/${sessionId}/thematic-lines/${thematicLineId}`, { method: "DELETE" }),
  },
  emailTemplates: {
    sections: (organizationId: string) => apiFetch<any[]>(`/organizations/${organizationId}/email-sections`),
    createSection: (organizationId: string, data: any) => apiFetch<any>(`/organizations/${organizationId}/email-sections`, { method: "POST", body: JSON.stringify(data) }),
    updateSection: (organizationId: string, id: string, data: any) => apiFetch<any>(`/organizations/${organizationId}/email-sections/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeSection: (organizationId: string, id: string) => apiFetch<any>(`/organizations/${organizationId}/email-sections/${id}`, { method: "DELETE" }),
    list: (organizationId: string, search?: string, category?: string) =>
      apiFetch<any[]>(`/organizations/${organizationId}/email-templates?${search ? `search=${encodeURIComponent(search)}&` : ""}${category ? `category=${encodeURIComponent(category)}` : ""}`),
    get: (id: string) => apiFetch<any>(`/email-templates/${id}`),
    getStarters: () => apiFetch<any[]>("/email-templates/starters"),
    create: (organizationId: string, data: any) =>
      apiFetch<any>(`/organizations/${organizationId}/email-templates`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/email-templates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) =>
      apiFetch<any>(`/email-templates/${id}`, { method: "DELETE" }),
    duplicate: (id: string, data?: { campaignId?: string; name?: string }) =>
      apiFetch<any>(`/email-templates/${id}/duplicate`, { method: "POST", body: JSON.stringify(data || {}) }),
    sendTest: (id: string, email: string) =>
      apiFetch<any>(`/email-templates/${id}/test`, { method: "POST", body: JSON.stringify({ email }) }),
  },
  emailSettings: {
    get: (organizationId: string) =>
      apiFetch<any>(`/organizations/${organizationId}/email-settings`),
    save: (organizationId: string, data: any) =>
      apiFetch<any>(`/organizations/${organizationId}/email-settings`, { method: "PUT", body: JSON.stringify(data) }),
    test: (organizationId: string, data: any) =>
      apiFetch<any>(`/organizations/${organizationId}/email-settings/test`, { method: "POST", body: JSON.stringify(data) }),
    webhooks: (organizationId: string) =>
      apiFetch<any>(`/organizations/${organizationId}/email-settings/resend-webhooks`),
    createWebhook: (organizationId: string, data?: { events?: string[] }) =>
      apiFetch<any>(`/organizations/${organizationId}/email-settings/resend-webhooks`, { method: "POST", body: JSON.stringify(data || {}) }),
    updateWebhook: (organizationId: string, webhookId: string, data: any) =>
      apiFetch<any>(`/organizations/${organizationId}/email-settings/resend-webhooks/${webhookId}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeWebhook: (organizationId: string, webhookId: string) =>
      apiFetch<any>(`/organizations/${organizationId}/email-settings/resend-webhooks/${webhookId}`, { method: "DELETE" }),
    rotateWebhookSecret: (organizationId: string, webhookId: string) =>
      apiFetch<any>(`/organizations/${organizationId}/email-settings/resend-webhooks/${webhookId}/rotate-secret`, { method: "POST" }),
    webhookEvents: (organizationId: string, webhookId: string, limit = 10) =>
      apiFetch<any>(`/organizations/${organizationId}/email-settings/resend-webhooks/${webhookId}/events?limit=${limit}`),
    replayWebhookEvent: (organizationId: string, webhookId: string, eventId: string) =>
      apiFetch<any>(`/organizations/${organizationId}/email-settings/resend-webhooks/${webhookId}/events/${eventId}/replay`, { method: "POST" }),
  },
  marketing: {
    variables: () => apiFetch<Array<{ key: string; label: string; category: string; description: string }>>("/marketing/variables"),
    contacts: (organizationId: string, search = "", page = 1, limit = 20) => apiFetch<any>(`/organizations/${organizationId}/marketing/contacts?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    createContact: (organizationId: string, data: any) => apiFetch<any>(`/organizations/${organizationId}/marketing/contacts`, { method: "POST", body: JSON.stringify(data) }),
    removeContact: (organizationId: string, id: string) => apiFetch<any>(`/organizations/${organizationId}/marketing/contacts/${id}`, { method: "DELETE" }),
    segments: (organizationId: string) => apiFetch<any[]>(`/organizations/${organizationId}/marketing/segments`),
    createSegment: (organizationId: string, data: any) => apiFetch<any>(`/organizations/${organizationId}/marketing/segments`, { method: "POST", body: JSON.stringify(data) }),
    createSegmentFromEvent: (organizationId: string, data: any) => apiFetch<any>(`/organizations/${organizationId}/marketing/segments/from-event`, { method: "POST", body: JSON.stringify(data) }),
    removeSegment: (organizationId: string, id: string) => apiFetch<any>(`/organizations/${organizationId}/marketing/segments/${id}`, { method: "DELETE" }),
    campaigns: (organizationId: string) => apiFetch<any[]>(`/organizations/${organizationId}/marketing/campaigns`),
    createCampaign: (organizationId: string, data: any) => apiFetch<any>(`/organizations/${organizationId}/marketing/campaigns`, { method: "POST", body: JSON.stringify(data) }),
    getCampaign: (organizationId: string, id: string) => apiFetch<any>(`/organizations/${organizationId}/marketing/campaigns/${id}`),
    updateCampaign: (organizationId: string, id: string, data: any) => apiFetch<any>(`/organizations/${organizationId}/marketing/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeCampaign: (organizationId: string, id: string) => apiFetch<any>(`/organizations/${organizationId}/marketing/campaigns/${id}`, { method: "DELETE" }),
    sendCampaign: (organizationId: string, id: string) => apiFetch<any>(`/organizations/${organizationId}/marketing/campaigns/${id}/send`, { method: "POST" }),
    campaignReport: (organizationId: string, id: string) => apiFetch<any>(`/organizations/${organizationId}/marketing/campaigns/${id}/report`),
    automations: (organizationId: string) => apiFetch<any[]>(`/organizations/${organizationId}/marketing/automations`),
    createAutomation: (organizationId: string, data: any) => apiFetch<any>(`/organizations/${organizationId}/marketing/automations`, { method: "POST", body: JSON.stringify(data) }),
    listAutomations: (organizationId: string) => apiFetch<any[]>(`/organizations/${organizationId}/marketing/automations`),
    updateAutomation: (id: string, data: any) => apiFetch<any>(`/marketing/automations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeAutomation: (id: string) => apiFetch<any>(`/marketing/automations/${id}`, { method: "DELETE" }),
    queueAutomation: (id: string) => apiFetch<{ queued: number }>(`/marketing/automations/${id}/queue`, { method: "POST" }),
    enrollExisting: (id: string) => apiFetch<{ enrolled: number; scanned: number }>(`/marketing/automations/${id}/enroll-existing`, { method: "POST" }),
    dispatchDue: (limit = 100) => apiFetch<any>(`/marketing/deliveries/dispatch?limit=${limit}`, { method: "POST" }),
    analytics: (organizationId: string) => apiFetch<Record<string, number>>(`/organizations/${organizationId}/marketing/analytics`),
  },
  registrations: {
    list: (eventId: string, status?: string) => apiFetch<any[]>(`/events/${eventId}/registrations${status ? `?status=${status}` : ""}`),
    cancel: (participantId: string) => apiFetch<{ cancelled: boolean; promoted: number }>(`/participants/${participantId}/cancel`, { method: "POST" }),
    confirm: (participantId: string) => apiFetch<any>(`/participants/${participantId}/confirm`, { method: "POST" }),
    promoteWaitlist: (eventId: string) => apiFetch<{ promoted: number }>(`/events/${eventId}/registrations/promote-waitlist`, { method: "POST" }),
  },
  integrations: {
    overview: (eventId: string) => apiFetch<IntegrationsOverview>(`/events/${eventId}/integrations`),
    updateSettings: (eventId: string, data: Partial<EventSettings>) => apiFetch<EventSettings>(`/events/${eventId}/settings`, { method: "PATCH", body: JSON.stringify(data) }),
    syncNow: (eventId: string) => apiFetch<{ sessions: number }>(`/events/${eventId}/integrations/sync`, { method: "POST" }),
    importZoom: (sessionId: string) => apiFetch<{ rows: number; people: number; valid: number; createdFromOpenRegistration: number; keptManualDecisions: number }>(`/sessions/${sessionId}/zoom/import-attendance`, { method: "POST" }),
    reconcileAttendance: (sessionId: string) => apiFetch<{ attendees: number }>(`/sessions/${sessionId}/attendance/reconcile`, { method: "POST" }),
    hostStartUrl: (sessionId: string) => apiFetch<{ startUrl: string }>(`/sessions/${sessionId}/zoom/start-url`),
    retryJob: (jobId: string) => apiFetch<any>(`/integration-jobs/${jobId}/retry`, { method: "POST" }),
  },
  files: {
    list: (eventId: string) => apiFetch<EventFile[]>(`/events/${eventId}/files`),
    upload: (eventId: string, file: File, data: { scope: "MATERIAL" | "DOCUMENT"; title: string; visibility: FileVisibility; sessionId?: string; sessionSpeakerId?: string; documentType?: string }) => {
      const body = new FormData()
      body.append("file", file)
      for (const [key, value] of Object.entries(data)) if (value) body.append(key, value)
      return apiFetch<EventFile>(`/events/${eventId}/files`, { method: "POST", body })
    },
    replace: (fileId: string, file: File) => {
      const body = new FormData()
      body.append("file", file)
      return apiFetch<EventFile>(`/event-files/${fileId}/versions`, { method: "POST", body })
    },
    update: (fileId: string, data: { title?: string; visibility?: FileVisibility; status?: "ACTIVE" | "HIDDEN" | "DELETED" }) => apiFetch<EventFile>(`/event-files/${fileId}`, { method: "PATCH", body: JSON.stringify(data) }),
    download: (fileId: string, version?: number) => apiFetch<{ url: string; expiresAt: string }>(`/event-files/${fileId}/download${version ? `?version=${version}` : ""}`),
    mySpeakerSessions: () => apiFetch<any[]>("/me/speaker-sessions"),
  },
  eventCertificates: {
    list: (eventId: string) => apiFetch<any[]>(`/events/${eventId}/certificates`),
    issue: (eventId: string, data: { participantIds?: string[]; roleIds?: string[]; templateId?: string }) => apiFetch<{ issued: number; pending: number; certificates: any[]; skipped: Array<{ participantId: string; roleId: string | null; reason: string }> }>(`/events/${eventId}/certificates/issue`, { method: "POST", body: JSON.stringify(data) }),
    directApproval: (eventId: string, data: { participantIds: string[]; roleId: string; approved: boolean; reason?: string }) => apiFetch<{ updated: number }>(`/events/${eventId}/role-approvals`, { method: "POST", body: JSON.stringify(data) }),
    revoke: (id: string, reason?: string) => apiFetch<any>(`/certificates/${id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) }),
    reissue: (id: string, reason?: string) => apiFetch<any>(`/certificates/${id}/reissue`, { method: "POST", body: JSON.stringify({ reason }) }),
    retry: (id: string) => apiFetch<any>(`/certificates/${id}/retry`, { method: "POST" }),
  },
  directory: {
    reviews: (organizationId: string, status: "OPEN" | "RESOLVED" = "OPEN") => apiFetch<any[]>(`/directory/reviews?organizationId=${encodeURIComponent(organizationId)}&status=${status}`),
    resolve: (id: string, data: { action: "KEEP_SEPARATE" | "MERGE"; targetProfileId?: string }) => apiFetch<any>(`/directory/reviews/${id}/resolve`, { method: "POST", body: JSON.stringify(data) }),
  },
}

export type FileVisibility = "PUBLIC" | "REGISTERED" | "PRIVATE"
export interface EventFile {
  id: string; scope: "MATERIAL" | "DOCUMENT"; title: string; documentType: string | null; visibility: FileVisibility; status: "ACTIVE" | "HIDDEN" | "DELETED"; currentVersion: number; createdAt: string
  session: { id: string; title: string } | null
  speaker: { id: string; role: string; profile: { firstName: string | null; lastName: string | null } } | null
  versions: Array<{ id: string; version: number; fileName: string; mimeType: string; size: number; createdAt: string }>
}
export interface EventSettings {
  virtualAttendanceMode: "MANUAL" | "AUTOMATIC"; attendanceThreshold: number; capacity: number | null; waitlistEnabled: boolean; reminderOffsets: number[]
  zoomEnabled: boolean; facebookLiveEnabled: boolean; attendanceMirrorEnabled: boolean; eventMode?: string | null
}
export type SyncState = "DISABLED" | "PENDING" | "SYNCED" | "ERROR"
export interface IntegrationsOverview {
  providers: { zoom: boolean; zoomWebhook: boolean; facebook: boolean; attendance: boolean; certificates: boolean; telegram: boolean; storage: string }
  settings: EventSettings & { id: string; eventName: string }
  sessions: Array<{
    id: string; title: string; startsAt: string | null; endsAt: string | null; modality: string | null
    activity: { title: string; edition: { id: string; name: string } }
    integration: { zoomMeetingId: string | null; zoomJoinUrl: string | null; zoomStatus: SyncState; zoomError: string | null; zoomEndedAt: string | null; facebookLiveUrl: string | null; facebookStatus: SyncState; facebookError: string | null; attendanceEventId: string | null; attendanceStatus: SyncState; attendanceError: string | null; attendanceSyncedAt: string | null } | null
    registrants: Array<{ status: SyncState; count: number }>
  }>
  failedJobs: Array<{ id: string; kind: string; lastError: string | null; attempts: number; updatedAt: string }>
}
