import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom"
import { AuthGuard } from "./AuthGuard"
import { LoginPage } from "@/pages/LoginPage"
import { ResetPasswordPage } from "@/pages/ResetPasswordPage"
import { OrganizationsPage } from "@/pages/OrganizationsPage"
import { OrganizationSettingsPage } from "@/pages/OrganizationSettingsPage"
import { CreateOrganizationPage } from "@/pages/CreateOrganizationPage"
import {
  ProfileLayout,
  ProfileInfoSection,
  ProfileExperienceSection,
  ProfileEducationSection,
  ProfileCertificationsSection,
} from "@/pages/profile"
import { EventsPage } from "@/pages/EventsPage"
import { EventDetailPage } from "@/pages/EventDetailPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { PrivateLayout } from "@/layouts/PrivateLayout"
import { BranchesPage } from "@/pages/BranchesPage"
import { BranchFormPage } from "@/pages/BranchFormPage"
import { MembersPage } from "@/pages/MembersPage"
import { CreateEventPage } from "@/pages/CreateEventPage"
import { EditEventPage } from "@/pages/EditEventPage"
import { CreateEditionPage } from "@/pages/CreateEditionPage"
import { EditEditionPage } from "@/pages/EditEditionPage"
import { CreateSpeakerPage } from "@/pages/CreateSpeakerPage"
import { EditSpeakerPage } from "@/pages/EditSpeakerPage"
import {
  EventInfoSection,
  EventEditionsSection,
  EventSpeakersSection,
  EventAgendaSection,
  EventAttendeesSection,
  EventRolesSection,
  EventThematicLinesSection,
  EventActivityFormPage,
  EventTicketsSection,
  EventAttendeeFormPage,
  EventSpeakersImportPage,
  EventCertificatesSection,
  EventFormsSection,
  EventPublicApiSection,
  EventFormBuilderPage,
} from "@/pages/event-detail"
import { GlobalCertificatesPage } from "@/pages/GlobalCertificatesPage"
import {
  ProfilesPage,
  ProfileManageLayout,
  ProfileManageInfoSection,
  ProfileManageExperienceSection,
  ProfileManageEducationSection,
  ProfileManageCertificationsSection,
  ProfileManageDangerSection,
  CreateProfilePage,
  ProfileManageAccountSection,
} from "@/pages/profiles"
import { VerifyCertificatePage } from "@/pages/VerifyCertificatePage"
import { AdminLayout } from "@/layouts/AdminLayout"
import { AdminPage } from "@/pages/AdminPage"
import { EventSetupPage } from "@/pages/EventSetupPage"
import {
  TemplatesListPage,
  TemplateConfigPage,
  EmailTemplateBuilderPage,
} from "@/pages/templates"
import { MarketingPage } from "@/pages/marketing"
import { InstitutionsPage, SessionsPage, AgreementsPage } from "@/pages/commission"

function HashHandler() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const hash = window.location.hash || location.hash
    if (
      location.pathname !== "/reset-password" &&
      hash &&
      hash.includes("type=recovery") &&
      hash.includes("access_token")
    ) {
      navigate(
        {
          pathname: "/reset-password",
          hash: hash,
        },
        { replace: true }
      )
    }
  }, [navigate, location])

  return null
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <HashHandler />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/validar/:code" element={<VerifyCertificatePage />} />

        <Route path="/admin" element={<AuthGuard allowedRoles={["SUPER_ADMIN", "SAAS_ADMIN"]} requireSelectedOrganization={false}><AdminLayout /></AuthGuard>}>
          <Route index element={<AdminPage />} />
          <Route path="organizations" element={<AdminPage />} />
          <Route path="users" element={<AdminPage />} />
          <Route path="plans" element={<AdminPage />} />
          <Route path="payments" element={<AdminPage />} />
          <Route path="settings" element={<AdminPage />} />
        </Route>

        {/* Dashboard Routes requiring Authentication but NO Selected Organization yet */}
        <Route
          path="/dashboard/organizations"
          element={
            <AuthGuard requireSelectedOrganization={false}>
              <OrganizationsPage />
            </AuthGuard>
          }
        />

        <Route
          path="/dashboard/organizations/new"
          element={
            <AuthGuard requireSelectedOrganization={false}>
              <CreateOrganizationPage />
            </AuthGuard>
          }
        />

        <Route
          path="/dashboard/profile"
          element={
            <AuthGuard requireSelectedOrganization={false}>
              <ProfileLayout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="info" replace />} />
          <Route path="info" element={<ProfileInfoSection />} />
          <Route path="experience" element={<ProfileExperienceSection />} />
          <Route path="education" element={<ProfileEducationSection />} />
          <Route path="certifications" element={<ProfileCertificationsSection />} />
        </Route>

        {/* Protected Dashboard Routes (Requires Selected Organization) */}
        <Route
          path="/dashboard"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <PrivateLayout />
            </AuthGuard>
          }
        >
          {/* Main organization dashboard metrics */}
          <Route index element={<DashboardPage />} />

          {/* Events Catalog */}
          <Route path="events" element={<EventsPage />} />

          {/* Email Marketing Templates */}
          <Route path="templates" element={<TemplatesListPage />} />
          <Route path="templates/new" element={<TemplateConfigPage />} />
          <Route path="templates/:templateId/edit" element={<TemplateConfigPage />} />
          <Route path="marketing" element={<Navigate to="/dashboard/marketing/campaigns" replace />} />
          <Route path="marketing/campaigns/:campaignId/settings" element={<MarketingPage />} />
          <Route path="marketing/:section" element={<MarketingPage />} />

          {/* Registered Profiles Catalog */}
          <Route path="profiles" element={<ProfilesPage />} />
          <Route path="profiles/new" element={<CreateProfilePage />} />

          {/* Certificates Catalog */}
          <Route path="certificates" element={<GlobalCertificatesPage />} />

          {/* Commission (CNPP) */}
          <Route path="commission/institutions" element={<InstitutionsPage />} />
          <Route path="commission/sessions" element={<SessionsPage />} />
          <Route path="commission/agreements" element={<AgreementsPage />} />

          {/* Settings Page */}
          <Route path="settings/business" element={<OrganizationSettingsPage />} />

          {/* Branches Pages */}
          <Route path="settings/branches" element={<BranchesPage />} />
          <Route path="settings/branches/new" element={<BranchFormPage />} />
          <Route path="settings/branches/:branchId/edit" element={<BranchFormPage />} />

          {/* Members Pages */}
          <Route path="settings/members" element={<MembersPage />} />
        </Route>

        {/* Standalone Pages (WITHOUT Sidebar/Navbar Layout) */}
        <Route
          path="/dashboard/events/new"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <CreateEventPage />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard/events/:id/edit"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <EditEventPage />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard/events/:id/setup"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <EventSetupPage />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard/events/:eventId/editions/new"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <CreateEditionPage />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard/events/:eventId/editions/:editionId/edit"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <EditEditionPage />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard/events/:eventId/speakers/new"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <CreateSpeakerPage />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard/events/:eventId/speakers/:speakerId/edit"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <EditSpeakerPage />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard/events/:id/forms/:formId"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <EventFormBuilderPage />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard/templates/:templateId/builder"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <EmailTemplateBuilderPage />
            </AuthGuard>
          }
        />

        {/* Event Detail - Standalone (no admin layout) */}
        <Route
          path="/dashboard/events/:id"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <EventDetailPage />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="info" replace />} />
          <Route path="info" element={<EventInfoSection />} />
          <Route path="editions" element={<EventEditionsSection />} />
          <Route path="speakers" element={<EventSpeakersSection />} />
          <Route path="speakers/import" element={<EventSpeakersImportPage />} />
          <Route path="agenda" element={<EventAgendaSection />} />
          <Route path="agenda/new" element={<EventActivityFormPage />} />
          <Route path="agenda/:activityId/edit" element={<EventActivityFormPage />} />
          <Route path="attendees" element={<EventAttendeesSection />} />
          <Route path="attendees/new" element={<EventAttendeeFormPage />} />
          <Route path="roles" element={<EventRolesSection />} />
          <Route path="thematic-lines" element={<EventThematicLinesSection />} />
          <Route path="tickets" element={<EventTicketsSection />} />
          <Route path="certificates" element={<EventCertificatesSection />} />
          <Route path="forms" element={<EventFormsSection />} />
          <Route path="public-api" element={<EventPublicApiSection />} />
        </Route>

        {/* Profiles Detail - Standalone (no admin layout) */}
        <Route
          path="/dashboard/profiles/:profileId"
          element={
            <AuthGuard requireSelectedOrganization={true}>
              <ProfileManageLayout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="info" replace />} />
          <Route path="info" element={<ProfileManageInfoSection />} />
          <Route path="account" element={<AuthGuard allowedRoles={["SUPER_ADMIN", "SAAS_ADMIN"]} requireSelectedOrganization={false}><ProfileManageAccountSection /></AuthGuard>} />
          <Route path="experience" element={<ProfileManageExperienceSection />} />
          <Route path="education" element={<ProfileManageEducationSection />} />
          <Route path="certifications" element={<ProfileManageCertificationsSection />} />
          <Route path="danger" element={<ProfileManageDangerSection />} />
        </Route>

        {/* Fallback redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
