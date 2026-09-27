# UI console. Docker uses Next standalone so the runner does not ship the
# full node_modules (~900MB). Turbopack tracing often omits `next`; the
# image build is webpack. pnpm is hoisted + copy so COPY is real files
# (Docker Desktop cannot follow the pnpm store). Local `pnpm start` stays
# `next start` (DOCKER_STANDALONE is unset).
#
# Runtime is Distroless Node 22 (Debian 13): no shell, apt, or git. Debug
# with compose logs, or temporarily rebuild FROM …nodejs22-debian13:debug.
# Hub and worker are Alpine (git/ssh/ansible-core). Worker also has
# docker-cli (host sock) and sshpass.
# Distroless ENTRYPOINT is already `node`; CMD must be ["server.js"] only.

FROM node:22-trixie-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
  && printf '%s\n' 'node-linker=hoisted' 'package-import-method=copy' > .npmrc \
  && pnpm install --frozen-lockfile

FROM node:22-trixie-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.npmrc ./.npmrc
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_STANDALONE=1
RUN corepack enable && pnpm exec next build --webpack

FROM node:22-trixie-slim AS prepare
WORKDIR /app
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/docs ./docs
COPY --from=build /app/documentation ./documentation
COPY --from=build /app/README.md ./README.md
COPY --from=build /app/CONTRIBUTING.md ./CONTRIBUTING.md
RUN test -f /app/server.js \
  && node -e "require('next'); require('react')" \
  && find /app -type f -name "*.map" -delete \
  && rm -rf /app/.next/cache

FROM gcr.io/distroless/nodejs22-debian13 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=prepare /app /app
EXPOSE 3000
CMD ["server.js"]
