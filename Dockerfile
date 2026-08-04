# Stage 1: Install dependencies
# Alpine rather than the Debian-based default: same bun binary (84.5MB), on an
# 11MB userland instead of a 132MB one, and both amd64 and arm64 are published.
# Not distroless -- sh is needed for docker exec and for HEALTHCHECK's CMD-SHELL.
FROM oven/bun:1-alpine AS base
WORKDIR /usr/src/app

# Install dependencies into a temp directory once. There used to be a second,
# --production-only install here to build a separate runtime-only tree, but the
# runtime image no longer ships a dependency tree at all (see the runner stage
# below) -- it copies exactly one dependency-free package out of this one.
FROM base AS install
RUN mkdir -p /temp/deps
COPY package.json bun.lock /temp/deps/
WORKDIR /temp/deps
RUN bun install --frozen-lockfile

# Stage 2: Build application
FROM base AS builder
WORKDIR /usr/src/app
COPY --from=install /temp/deps/node_modules node_modules
COPY . .
# VITE_ prefixed vars are client-side and must be set at build time
ARG VITE_BETTER_AUTH_URL="https://localhost:3000"
ENV VITE_BETTER_AUTH_URL=$VITE_BETTER_AUTH_URL
# Railway has no docker build-secret support, so the real secret lands in this stage's build cache
# and logs. It does not reach the runtime image (the runner stage is separate) and is not baked
# into the bundle — auth.ts reads process.env at runtime.
# Track: https://station.railway.com/feedback/support-docker-build-secrets-0b8787b2
ARG BETTER_AUTH_SECRET
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
RUN bun --bun run prepare && bun --bun run build:all

# Stage 3: Production image
FROM base AS runner

# Static OCI metadata, so an image built outside the pipeline — by a self-hoster from
# source, or by Railway — is still self-describing. CI overrides these and adds the
# dynamic ones (revision, version, created) via docker/metadata-action.
LABEL org.opencontainers.image.title="uppity" \
  org.opencontainers.image.description="Self-hosted uptime monitoring and status pages. HTTP, TCP, and push-based health checks with incident tracking and multi-channel notifications." \
  org.opencontainers.image.source="https://github.com/NeonRook/uppity" \
  org.opencontainers.image.url="https://github.com/NeonRook/uppity" \
  org.opencontainers.image.documentation="https://github.com/NeonRook/uppity#readme" \
  org.opencontainers.image.licenses="AGPL-3.0-only" \
  org.opencontainers.image.vendor="NeonRook"
# Create non-root user
# busybox applets, so short flags only: -S system, -u uid, -g gid, -G group.
RUN addgroup -S -g 1001 uppity && \
  adduser -S -u 1001 -G uppity uppity

# The runtime tree is exactly RUNTIME_EXTERNALS from externals.config.ts -- the
# specifiers that cannot be bundled and are actually executed. Everything else the
# server needs is inlined into build/server. Copied by path out of the install
# stage's one dependency tree so the version matches what the build resolved,
# with no second install. @opentelemetry/api declares no dependencies, so this
# directory is complete.
COPY --from=install --chown=uppity:uppity \
  /temp/deps/node_modules/@opentelemetry/api node_modules/@opentelemetry/api

COPY --from=builder --chown=uppity:uppity /usr/src/app/build ./build

# Migration SQL. scripts/migrate.ts hardcodes ./drizzle; drizzle.config.ts is
# drizzle-kit's config and drizzle-kit is not in this image, so it is not copied.
COPY --from=builder --chown=uppity:uppity /usr/src/app/drizzle ./drizzle

# A minimal manifest rather than the project's. Two reasons: "type": "module" so
# Bun treats build/*.js as ESM, and a full manifest would declare ~40 packages
# that are not present, which vulnerability scanners report as findings against
# code that does not ship.
RUN printf '{"type":"module","private":true}' > package.json && \
  chown uppity:uppity package.json

USER uppity
EXPOSE 3000/tcp
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Image-level healthcheck — runs inside the container, no curl/wget required.
# Workers run the same image but override CMD and don't serve HTTP, so this
# probe will fail for them — disable the healthcheck on worker containers in
# your deployment config.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'

# Default to web server, override for workers:
#   docker run ... [image] bun run ./build/worker-monitor.js
#   docker run ... [image] bun run ./build/worker-notifier.js
CMD ["bun", "--bun", "run", "./build/index.js"]
