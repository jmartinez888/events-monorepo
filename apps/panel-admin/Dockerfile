# syntax=docker/dockerfile:1.7
# Panel de administración (React + Vite). Etapas: dev (servidor Vite) y runtime (estáticos en nginx).
# Contexto de build: raíz del monorepo. Las variables VITE_* se fijan en el build: llegan al navegador.
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/panel-admin/package.json apps/panel-admin/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter panel-admin

FROM deps AS dev
COPY apps/panel-admin apps/panel-admin
WORKDIR /repo/apps/panel-admin
EXPOSE 5173
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5173"]

FROM deps AS build
ARG VITE_API_URL
ARG VITE_COOKIE_SECRET
ENV VITE_API_URL=${VITE_API_URL} VITE_COOKIE_SECRET=${VITE_COOKIE_SECRET}
COPY apps/panel-admin apps/panel-admin
WORKDIR /repo/apps/panel-admin
RUN test -n "$VITE_API_URL" || (echo "Falta el build arg VITE_API_URL" && exit 1)
RUN pnpm build

FROM nginx:1.27-alpine AS runtime
COPY apps/panel-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/panel-admin/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
