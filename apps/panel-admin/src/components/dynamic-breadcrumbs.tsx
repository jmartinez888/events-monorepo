import { useLocation, Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import React from "react";

const routeMap: Record<string, string> = {
  dashboard: "Inicio",
  events: "Eventos",
  organizations: "Organizaciones",
  settings: "Ajustes",
  business: "Organización",
  integrations: "Integraciones",
  new: "Nuevo Evento",
  edit: "Editar",
  login: "Iniciar Sesión",
};

const routeRewrites: Record<string, string> = {
  "/dashboard/settings": "/dashboard/settings/business",
};

const validRoutes = new Set([
  "/dashboard",
  "/dashboard/events",
  "/dashboard/organizations",
  "/dashboard/settings/business",
  "/dashboard/settings/integrations",
]);

export function DynamicBreadcrumbs() {
  const { pathname } = useLocation();
  const pathSegments = pathname.split("/").filter((v) => v);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {pathSegments.map((segment, index) => {
          const originalHref = `/${pathSegments.slice(0, index + 1).join("/")}`;
          const isLast = index === pathSegments.length - 1;
          
          const rewrittenHref = routeRewrites[originalHref] || originalHref;
          const isClickable = !isLast && (validRoutes.has(originalHref) || routeRewrites[originalHref] !== undefined);

          const isUuidOrId = /^[0-9a-fA-F-]+$/.test(segment) || /^\d+$/.test(segment);
          const label = routeMap[segment] || (isUuidOrId ? "Workspace del Evento" : segment.length > 25 ? segment.substring(0, 15) + "..." : segment);

          return (
            <React.Fragment key={originalHref}>
              <BreadcrumbItem>
                {!isClickable ? (
                  <BreadcrumbPage className="text-xs font-semibold text-foreground capitalize">
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={rewrittenHref} className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors capitalize">
                      {label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator className="h-3 w-3 opacity-40" />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
