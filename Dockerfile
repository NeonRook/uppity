# Runtime base. Alpine rather than the Debian-based default: same bun binary
# (84.5MB), on an 11MB userland instead of a 132MB one, and both amd64 and arm64
# are published. Not distroless -- sh is needed for docker exec and for
# HEALTHCHECK's CMD-SHELL.
FROM oven/bun:1-alpine AS base
# Pick up Alpine security fixes the bun image lags behind.
RUN apk -U upgrade --no-cache
WORKDIR /usr/src/app

# Build-time base, Debian. @inlang/paraglide-js 2.24 pulls @inlang/sdk 3, which
# replaced the WASM SQLite in @lix-js/sdk with a native addon. Its prebuilt
# binaries are glibc-only -- darwin-arm64, linux-arm64, linux-x64, win32-x64, no
# musl -- so under Alpine `paraglide-js compile` cannot load it and the build
# dies on a missing ld-linux-x86-64.so.2. gcompat does not rescue it: the loader
# then resolves, but relocation fails on __isoc23_strtoull, a glibc 2.38 symbol
# gcompat does not implement.
FROM node:26 AS build-base
WORKDIR /usr/src/app

ENV MISE_DATA_DIR=/mise \
  MISE_CONFIG_DIR=/mise \
  MISE_CACHE_DIR=/mise/cache \
  MISE_INSTALL_PATH=/usr/local/bin/mise \
  MISE_TRUSTED_CONFIG_PATHS=/usr/src/app \
  PATH=/mise/shims:$PATH
COPY mise.toml /mise/config.toml
RUN curl https://mise.run | sh && mise install aube

# Install dependencies into a temp directory once, for the builder's use only.
# Nothing from this tree reaches the runtime image: the SSR bundle inlines every
# dependency it needs, so the runner stage ships no node_modules at all.
FROM build-base AS install
RUN mkdir -p /temp/deps
COPY package.json aube-lock.yaml .npmrc /temp/deps/
WORKDIR /temp/deps
# Without this, node_modules/.aube/* are absolute symlinks into a per-user store
# at ~/.cache/aube/virtual-store, and the builder's COPY brings the links but not
# their targets. aube disables the shared store when CI is set; a docker build has
# no CI, so ask for per-project materialization explicitly.
# AUBE_JAIL_BUILDS=false: the .npmrc build jail needs Landlock and seccomp, and
# aube fails a dependency script outright when the kernel cannot enforce them
# rather than run it unjailed. Builder kernels do not always ship Landlock, and
# the build container already confines these scripts, so drop the jail here and
# keep it for dev installs.
RUN AUBE_JAIL_BUILDS=false aube ci --disable-global-virtual-store

# Stage 2: Build application
FROM build-base AS builder
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
RUN aubr prepare && aubr build:all

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

# No node_modules. Every specifier the server needs is inlined into build/server,
# and scripts/check-externals.ts fails the build if that ever stops being true.
# Nothing to COPY from the install stage -- it exists only to feed the builder.
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
