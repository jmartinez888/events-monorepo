import { Component, lazy, Suspense, useEffect, type ReactNode } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { AuthGuard } from "./AuthGuard";
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/ResetPasswordPage").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const OrganizationsPage = lazy(() =>
  import("@/pages/OrganizationsPage").then((module) => ({
    default: module.OrganizationsPage,
  })),
);
const OrganizationSettingsPage = lazy(() =>
  import("@/pages/OrganizationSettingsPage").then((module) => ({
    default: module.OrganizationSettingsPage,
  })),
);
const CreateOrganizationPage = lazy(() =>
  import("@/pages/CreateOrganizationPage").then((module) => ({
    default: module.CreateOrganizationPage,
  })),
);
const ProfileLayout = lazy(() =>
  import("@/pages/profile/ProfileLayout").then((module) => ({
    default: module.ProfileLayout,
  })),
);
const ProfileInfoSection = lazy(() =>
  import("@/pages/profile/ProfileInfoSection").then((module) => ({
    default: module.ProfileInfoSection,
  })),
);
const ProfileExperienceSection = lazy(() =>
  import("@/pages/profile/ProfileExperienceSection").then((module) => ({
    default: module.ProfileExperienceSection,
  })),
);
const ProfileEducationSection = lazy(() =>
  import("@/pages/profile/ProfileEducationSection").then((module) => ({
    default: module.ProfileEducationSection,
  })),
);
const ProfileCertificationsSection = lazy(() =>
  import("@/pages/profile/ProfileCertificationsSection").then((module) => ({
    default: module.ProfileCertificationsSection,
  })),
);
const EventsPage = lazy(() =>
  import("@/pages/EventsPage").then((module) => ({
    default: module.EventsPage,
  })),
);
const EventDetailPage = lazy(() =>
  import("@/pages/EventDetailPage").then((module) => ({
    default: module.EventDetailPage,
  })),
);
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
import { PrivateLayout } from "@/layouts/PrivateLayout";
const BranchesPage = lazy(() =>
  import("@/pages/BranchesPage").then((module) => ({
    default: module.BranchesPage,
  })),
);
const BranchFormPage = lazy(() =>
  import("@/pages/BranchFormPage").then((module) => ({
    default: module.BranchFormPage,
  })),
);
const MembersPage = lazy(() =>
  import("@/pages/MembersPage").then((module) => ({
    default: module.MembersPage,
  })),
);
const CreateEventPage = lazy(() =>
  import("@/pages/CreateEventPage").then((module) => ({
    default: module.CreateEventPage,
  })),
);
const EditEventPage = lazy(() =>
  import("@/pages/EditEventPage").then((module) => ({
    default: module.EditEventPage,
  })),
);
const CreateEditionPage = lazy(() =>
  import("@/pages/CreateEditionPage").then((module) => ({
    default: module.CreateEditionPage,
  })),
);
const EditEditionPage = lazy(() =>
  import("@/pages/EditEditionPage").then((module) => ({
    default: module.EditEditionPage,
  })),
);
const CreateSpeakerPage = lazy(() =>
  import("@/pages/CreateSpeakerPage").then((module) => ({
    default: module.CreateSpeakerPage,
  })),
);
const EditSpeakerPage = lazy(() =>
  import("@/pages/EditSpeakerPage").then((module) => ({
    default: module.EditSpeakerPage,
  })),
);
const EventInfoSection = lazy(() =>
  import("@/pages/event-detail/EventInfoSection").then((module) => ({
    default: module.EventInfoSection,
  })),
);
const EventEditionsSection = lazy(() =>
  import("@/pages/event-detail/EventEditionsSection").then((module) => ({
    default: module.EventEditionsSection,
  })),
);
const EventSpeakersSection = lazy(() =>
  import("@/pages/event-detail/EventSpeakersSection").then((module) => ({
    default: module.EventSpeakersSection,
  })),
);
const EventAgendaSection = lazy(() =>
  import("@/pages/event-detail/EventAgendaSection").then((module) => ({
    default: module.EventAgendaSection,
  })),
);
const EventAttendeesSection = lazy(() =>
  import("@/pages/event-detail/EventAttendeesSection").then((module) => ({
    default: module.EventAttendeesSection,
  })),
);
const EventRolesSection = lazy(() =>
  import("@/pages/event-detail/EventRolesSection").then((module) => ({
    default: module.EventRolesSection,
  })),
);
const EventThematicLinesSection = lazy(() =>
  import("@/pages/event-detail/EventThematicLinesSection").then((module) => ({
    default: module.EventThematicLinesSection,
  })),
);
const EventActivityFormPage = lazy(() =>
  import("@/pages/event-detail/EventActivityFormPage").then((module) => ({
    default: module.EventActivityFormPage,
  })),
);
const EventTicketsSection = lazy(() =>
  import("@/pages/event-detail/EventTicketsSection").then((module) => ({
    default: module.EventTicketsSection,
  })),
);
const EventAttendeeFormPage = lazy(() =>
  import("@/pages/event-detail/EventAttendeeFormPage").then((module) => ({
    default: module.EventAttendeeFormPage,
  })),
);
const EventSpeakersImportPage = lazy(() =>
  import("@/pages/event-detail/EventSpeakersImportPage").then((module) => ({
    default: module.EventSpeakersImportPage,
  })),
);
const EventCertificatesSection = lazy(() =>
  import("@/pages/event-detail/EventCertificatesSection").then((module) => ({
    default: module.EventCertificatesSection,
  })),
);
const EventFormsSection = lazy(() =>
  import("@/pages/event-detail/EventFormsSection").then((module) => ({
    default: module.EventFormsSection,
  })),
);
const EventPublicApiSection = lazy(() =>
  import("@/pages/event-detail/EventPublicApiSection").then((module) => ({
    default: module.EventPublicApiSection,
  })),
);
const EventFormBuilderPage = lazy(() =>
  import("@/pages/event-detail/EventFormBuilderPage").then((module) => ({
    default: module.EventFormBuilderPage,
  })),
);
const GlobalCertificatesPage = lazy(() =>
  import("@/pages/GlobalCertificatesPage").then((module) => ({
    default: module.GlobalCertificatesPage,
  })),
);
const ProfilesPage = lazy(() =>
  import("@/pages/profiles/ProfilesPage").then((module) => ({
    default: module.ProfilesPage,
  })),
);
const ProfileManageLayout = lazy(() =>
  import("@/pages/profiles/ProfileManageLayout").then((module) => ({
    default: module.ProfileManageLayout,
  })),
);
const ProfileManageInfoSection = lazy(() =>
  import("@/pages/profiles/ProfileManageInfoSection").then((module) => ({
    default: module.ProfileManageInfoSection,
  })),
);
const ProfileManageExperienceSection = lazy(() =>
  import("@/pages/profiles/ProfileManageExperienceSection").then((module) => ({
    default: module.ProfileManageExperienceSection,
  })),
);
const ProfileManageEducationSection = lazy(() =>
  import("@/pages/profiles/ProfileManageEducationSection").then((module) => ({
    default: module.ProfileManageEducationSection,
  })),
);
const ProfileManageCertificationsSection = lazy(() =>
  import("@/pages/profiles/ProfileManageCertificationsSection").then(
    (module) => ({ default: module.ProfileManageCertificationsSection }),
  ),
);
const ProfileManageDangerSection = lazy(() =>
  import("@/pages/profiles/ProfileManageDangerSection").then((module) => ({
    default: module.ProfileManageDangerSection,
  })),
);
const CreateProfilePage = lazy(() =>
  import("@/pages/profiles/CreateProfilePage").then((module) => ({
    default: module.CreateProfilePage,
  })),
);
const ProfileManageAccountSection = lazy(() =>
  import("@/pages/profiles/ProfileManageAccountSection").then((module) => ({
    default: module.ProfileManageAccountSection,
  })),
);
const VerifyCertificatePage = lazy(() =>
  import("@/pages/VerifyCertificatePage").then((module) => ({
    default: module.VerifyCertificatePage,
  })),
);
import { AdminLayout } from "@/layouts/AdminLayout";
const AdminPage = lazy(() =>
  import("@/pages/AdminPage").then((module) => ({ default: module.AdminPage })),
);
const EventSetupPage = lazy(() =>
  import("@/pages/EventSetupPage").then((module) => ({
    default: module.EventSetupPage,
  })),
);
const TemplatesListPage = lazy(() =>
  import("@/pages/templates/TemplatesListPage").then((module) => ({
    default: module.TemplatesListPage,
  })),
);
const TemplateConfigPage = lazy(() =>
  import("@/pages/templates/TemplateConfigPage").then((module) => ({
    default: module.TemplateConfigPage,
  })),
);
const EmailTemplateBuilderPage = lazy(() =>
  import("@/pages/templates/EmailTemplateBuilderPage").then((module) => ({
    default: module.EmailTemplateBuilderPage,
  })),
);
const MarketingPage = lazy(() =>
  import("@/pages/marketing/MarketingPage").then((module) => ({
    default: module.MarketingPage,
  })),
);
const InstitutionsPage = lazy(() =>
  import("@/pages/commission").then((module) => ({
    default: module.InstitutionsPage,
  })),
);
const SessionsPage = lazy(() =>
  import("@/pages/commission").then((module) => ({
    default: module.SessionsPage,
  })),
);
const AgreementsPage = lazy(() =>
  import("@/pages/commission").then((module) => ({
    default: module.AgreementsPage,
  })),
);

class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="p-6 text-sm">
          <p>No se pudo cargar la página.</p>
          <button
            type="button"
            className="mt-3 underline"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function HashHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const hash = window.location.hash || location.hash;
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
        { replace: true },
      );
    }
  }, [navigate, location]);

  return null;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <HashHandler />
      <RouteErrorBoundary>
        <Suspense
          fallback={
            <div role="status" className="p-6 text-sm text-muted-foreground">
              Cargando página...
            </div>
          }
        >
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/validar/:code" element={<VerifyCertificatePage />} />

            <Route
              path="/admin"
              element={
                <AuthGuard
                  allowedRoles={["SUPER_ADMIN", "SAAS_ADMIN"]}
                  requireSelectedOrganization={false}
                >
                  <AdminLayout />
                </AuthGuard>
              }
            >
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
              <Route
                path="certifications"
                element={<ProfileCertificationsSection />}
              />
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
              <Route
                path="templates/:templateId/edit"
                element={<TemplateConfigPage />}
              />
              <Route
                path="marketing"
                element={
                  <Navigate to="/dashboard/marketing/campaigns" replace />
                }
              />
              <Route
                path="marketing/campaigns/:campaignId/settings"
                element={<MarketingPage />}
              />
              <Route path="marketing/:section" element={<MarketingPage />} />

              {/* Registered Profiles Catalog */}
              <Route path="profiles" element={<ProfilesPage />} />
              <Route path="profiles/new" element={<CreateProfilePage />} />

              {/* Certificates Catalog */}
              <Route path="certificates" element={<GlobalCertificatesPage />} />

              {/* Commission (CNPP) */}
              <Route
                path="commission/institutions"
                element={<InstitutionsPage />}
              />
              <Route path="commission/sessions" element={<SessionsPage />} />
              <Route
                path="commission/agreements"
                element={<AgreementsPage />}
              />

              {/* Settings Page */}
              <Route
                path="settings/business"
                element={<OrganizationSettingsPage />}
              />

              {/* Branches Pages */}
              <Route path="settings/branches" element={<BranchesPage />} />
              <Route
                path="settings/branches/new"
                element={<BranchFormPage />}
              />
              <Route
                path="settings/branches/:branchId/edit"
                element={<BranchFormPage />}
              />

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
              <Route
                path="speakers/import"
                element={<EventSpeakersImportPage />}
              />
              <Route path="agenda" element={<EventAgendaSection />} />
              <Route path="agenda/new" element={<EventActivityFormPage />} />
              <Route
                path="agenda/:activityId/edit"
                element={<EventActivityFormPage />}
              />
              <Route path="attendees" element={<EventAttendeesSection />} />
              <Route path="attendees/new" element={<EventAttendeeFormPage />} />
              <Route path="roles" element={<EventRolesSection />} />
              <Route
                path="thematic-lines"
                element={<EventThematicLinesSection />}
              />
              <Route path="tickets" element={<EventTicketsSection />} />
              <Route
                path="certificates"
                element={<EventCertificatesSection />}
              />
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
              <Route
                path="account"
                element={
                  <AuthGuard
                    allowedRoles={["SUPER_ADMIN", "SAAS_ADMIN"]}
                    requireSelectedOrganization={false}
                  >
                    <ProfileManageAccountSection />
                  </AuthGuard>
                }
              />
              <Route
                path="experience"
                element={<ProfileManageExperienceSection />}
              />
              <Route
                path="education"
                element={<ProfileManageEducationSection />}
              />
              <Route
                path="certifications"
                element={<ProfileManageCertificationsSection />}
              />
              <Route path="danger" element={<ProfileManageDangerSection />} />
            </Route>

            {/* Fallback redirect */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </BrowserRouter>
  );
}
