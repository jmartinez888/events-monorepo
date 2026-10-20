# syntax=docker/dockerfile:1.7
# API NestJS + Prisma. Etapas: dev (recarga en caliente), migrate (migraciones) y runtime (producción/staging).
# Contexto de build: raíz del monorepo.
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# openssl: motor de Prisma en Alpine. corepack: pnpm en la versión fijada por packageManager.
RUN apk add --no-cache openssl libc6-compat && corepack enable
WORKDIR /repo

# Solo manifiestos: la capa de dependencias se reutiliza mientras no cambie el lockfile.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter events-api

FROM deps AS dev
COPY apps/api apps/api
WORKDIR /repo/apps/api
RUN pnpm exec prisma generate
EXPOSE 3000
CMD ["pnpm", "exec", "tsx", "watch", "src/main.ts"]

FROM deps AS build
COPY apps/api apps/api
WORKDIR /repo/apps/api
RUN pnpm exec prisma generate && pnpm build

# Tiene la CLI de Prisma (devDependency): se ejecuta una vez antes de la API.
FROM build AS migrate
CMD ["node", "scripts/migrate-deploy.mjs"]

# Copia aislada con dependencias de producción y el cliente Prisma ya generado.
FROM build AS deploy
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter events-api deploy --prod /prod/api \
 && CLIENT="$(find /repo/node_modules/.pnpm -type d -path '*/node_modules/.prisma/client' | head -n 1)" \
 && STUB_DIR="$(dirname "$(dirname "$(readlink -f /prod/api/node_modules/@prisma/client)")")/.prisma" \
 # pnpm deploy deja un cliente «stub» junto a @prisma/client; se reemplaza por el generado.
 && rm -rf "$STUB_DIR/client" && mkdir -p "$STUB_DIR" && cp -r "$CLIENT" "$STUB_DIR/client" \
 && rm -rf /prod/api/src /prod/api/test /prod/api/scripts /prod/api/prisma.config.ts /prod/api/tsconfig.json

FROM ${NODE_IMAGE} AS runtime
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=deploy --chown=node:node /prod/api ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
