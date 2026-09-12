# UI console. Do not run Next standalone server.js: Turbopack file tracing
# often omits `next`, and pnpm store symlinks break on Docker Desktop COPY.
# Runner uses a hoisted node_modules + `next start`.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
  && printf '%s\n' 'node-linker=hoisted' 'package-import-method=copy' > .npmrc \
  && pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.npmrc ./.npmrc
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NODE_PATH=/app/node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/docs ./docs
COPY --from=build /app/documentation ./documentation
COPY --from=build /app/README.md ./README.md
COPY --from=build /app/CONTRIBUTING.md ./CONTRIBUTING.md
RUN node -e "require('next'); require('react')" \
  && test -f node_modules/next/dist/bin/next \
  && find /app -type f -name "*.map" -delete \
  && rm -f /app/.env /app/.env.local /app/.env.production /app/.env.development
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
