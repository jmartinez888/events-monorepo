# syntax=docker/dockerfile:1.7
# Portal público (Astro SSR, adaptador Node standalone). Etapas: dev y runtime.
# Contexto de build: raíz del monorepo. PUBLIC_API_URL se fija en el build.
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true ASTRO_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/events-portal/package.json apps/events-portal/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter events-portal

FROM deps AS dev
COPY apps/events-portal apps/events-portal
WORKDIR /repo/apps/events-portal
EXPOSE 4321
CMD ["pnpm", "exec", "astro", "dev", "--host", "0.0.0.0", "--port", "4321"]

FROM deps AS build
ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=${PUBLIC_API_URL}
COPY apps/events-portal apps/events-portal
WORKDIR /repo/apps/events-portal
RUN test -n "$PUBLIC_API_URL" || (echo "Falta el build arg PUBLIC_API_URL" && exit 1)
RUN pnpm build

# El servidor SSR carga dependencias externas: se copian solo las de producción.
FROM build AS deploy
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter events-portal deploy --prod /prod/portal \
 && rm -rf /prod/portal/src /prod/portal/dist \
 && cp -r /repo/apps/events-portal/dist /prod/portal/dist

FROM ${NODE_IMAGE} AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 ASTRO_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=deploy --chown=node:node /prod/portal ./
USER node
EXPOSE 4321
# El portal no tiene página en «/»: basta con que el servidor responda sin error 5xx.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/entry.mjs"]
