# UI console. Docker uses Next standalone so the runner does not ship the
# full node_modules (~900MB). Turbopack tracing often omits `next`; the
# image build is webpack. pnpm is hoisted + copy so COPY is real files
# (Docker Desktop cannot follow the pnpm store). Local `pnpm start` stays
# `next start` (DOCKER_STANDALONE is unset).
#
# Build on node:22-alpine (musl). Runtime is plain alpine + only the node
# binary (no npm/yarn/corepack) so the image stays smaller than stock
# node:22-alpine. Hub and worker stay separate Alpine Python images.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
  && printf '%s\n' 'node-linker=hoisted' 'package-import-method=copy' > .npmrc \
  && pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.npmrc ./.npmrc
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_STANDALONE=1
RUN corepack enable && pnpm exec next build --webpack

FROM node:22-alpine AS prepare
WORKDIR /app
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/docs ./docs
COPY --from=build /app/documentation ./documentation
RUN test -f /app/server.js \
  && node -e "require('next'); require('react')" \
  && find /app -type f \( -name "*.map" -o -name "*.tsbuildinfo" \) -delete \
  && find /app -type f -name "LICENSE*" -delete \
  && rm -rf /app/.next/cache \
  && rm -rf \
       /app/node_modules/@img/sharp-linux-x64 \
       /app/node_modules/@img/sharp-libvips-linux-x64 \
       /app/node_modules/sharp/node_modules/@img/sharp-linux-x64 \
       /app/node_modules/sharp/node_modules/@img/sharp-libvips-linux-x64

FROM alpine:3.24 AS runner
RUN apk add --no-cache libstdc++ ca-certificates \
 && apk upgrade --no-cache zlib \
 && addgroup -g 1000 -S node \
 && adduser -u 1000 -S node -G node
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=deps /usr/local/bin/node /usr/local/bin/node
COPY --from=prepare /app /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
