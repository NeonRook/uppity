# Not distroless -- sh is needed for docker exec and for HEALTHCHECK's CMD-SHELL.
FROM denoland/deno:alpine AS base
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

# The .npmrc build jail wraps dependency scripts with Landlock and seccomp, and
# aube fails a script outright when the kernel cannot enforce them rather than
# run it unjailed. Builder kernels do not always ship Landlock, and the build
# container already confines these scripts, so drop the jail for image builds
# and keep it for dev installs. Stage-wide because aubr installs again before
# running scripts, so the builder stage jails too, not just the install stage.
ENV AUBE_JAIL_BUILDS=false

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
RUN aube ci --disable-global-virtual-store

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

COPY --from=builder --chown=uppity:uppity /usr/src/app/.deno-deploy ./.deno-deploy
COPY --from=builder --chown=uppity:uppity /usr/src/app/build ./build

# Migration SQL. scripts/migrate.ts hardcodes ./drizzle; drizzle.config.ts is
# drizzle-kit's config and drizzle-kit is not in this image, so it is not copied.
COPY --from=builder --chown=uppity:uppity /usr/src/app/drizzle ./drizzle

USER uppity
EXPOSE 3000/tcp
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# No --allow-* flags, and adding one breaks the probe rather than tightening it:
# deno eval runs with implicit access to every permission and rejects the
# permission flags outright, unlike deno run. The failure is quiet in the worst
# way -- the container reports unhealthy while the app serves fine.
#
# Workers run the same image but override CMD and don't serve HTTP, so this
# probe will fail for them — disable the healthcheck on worker containers in
# your deployment config.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD deno eval 'const p = Deno.env.get("PORT") ?? "3000"; const r = await fetch(`http://127.0.0.1:${p}/api/health`); if (!r.ok) Deno.exit(1);'

# Default to web server, override for workers:
#   docker run ... [image] deno run -A ./build/worker-monitor.js
#   docker run ... [image] deno run -A ./build/worker-notifier.js
CMD ["deno", "run", "-A", "./build/serve.js"]
