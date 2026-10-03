const isServer = typeof window === 'undefined';
const defaultPublic = import.meta.env.PUBLIC_API_URL ? `${import.meta.env.PUBLIC_API_URL.replace(/\/$/, '')}/api` : 'http://localhost:3010/api';
const apiUrl = isServer
  ? (process.env.INTERNAL_API_URL || 'http://api:3000/api')
  : defaultPublic;

export type PortalConfiguration = { isPublished: boolean; heroTitle?: string | null; heroDescription?: string | null; heroImageUrl?: string | null; featuredEventId?: string | null; sections?: unknown; navigation?: unknown; seoTitle?: string | null; seoDescription?: string | null };
export type PortalOrganization = { id: string; name: string; slug: string; description?: string | null; logoUrl?: string | null; coverUrl?: string | null; portal?: PortalConfiguration | null };
export type PortalEvent = { id: string; eventName: string; description?: string | null; startDate: string; endDate?: string | null; eventMode?: string | null; coverUrl?: string | null; logoUrl?: string | null; venueAddress?: string | null; latitude?: number | null; longitude?: number | null; contactEmail?: string | null; heroMedia?: { url: string; mimeType: string; orientation?: string } | null };

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`);
  if (!response.ok) throw new Error(`Portal API respondió ${response.status}`);
  return response.json() as Promise<T>;
}

export const portalApi = {
  events: (slug: string) => request<{ organization: PortalOrganization; events: PortalEvent[] }>(`/public/organizations/${encodeURIComponent(slug)}/events`),
  event: (slug: string, id: string) => request<PortalEvent & { details?: { content?: string | null; faqs?: unknown; sponsors?: unknown } | null; editions: Array<{ id: string; name: string; description?: string | null; coverUrl?: string | null; metaThumbnailUrl?: string | null; isCurrent?: boolean; startDate?: string | null; endDate?: string | null; modality?: string | null; location?: string | null; latitude?: number | null; longitude?: number | null; participants: Array<{ profile: { id: string; firstName?: string | null; lastName?: string | null; bio?: string | null; avatarUrl?: string | null } }>; activities: Array<{ id: string; title: string; description?: string | null; startsAt?: string | null; endsAt?: string | null }> }>; registrationForms: Array<{ title: string; description?: string | null; slug: string; purpose?: string | null; opensAt?: string | null; closesAt?: string | null; fields: Array<{key:string;label:string;type:string;required:boolean;options?:unknown;validation?:unknown}> }> }>(`/public/organizations/${encodeURIComponent(slug)}/events/${encodeURIComponent(id)}`),
  transparency: (slug: string) => request<{ organization: PortalOrganization; institutions: any[]; sessions: any[] }>(`/public/organizations/${encodeURIComponent(slug)}/commission/transparency`),
  apiUrl,
};
