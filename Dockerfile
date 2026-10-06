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
ARG MISE_VERSION=v2026.9.16
COPY mise.toml /mise/config.toml
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN curl https://mise.run | MISE_VERSION=$MISE_VERSION sh && mise install

# Install dependencies into a temp directory once, for the builder's use only.
# Nothing from this tree reaches the runtime image: the SSR bundle inlines every
# dependency it needs, so the runner stage ships no node_modules at all.
FROM build-base AS install
RUN mkdir -p /temp/deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /temp/deps/
WORKDIR /temp/deps
RUN pnpm install --frozen-lockfile

# Stage 2: Build application
FROM build-base AS builder
WORKDIR /usr/src/app
COPY --from=install /temp/deps/node_modules node_modules
COPY . .
# The build imports the auth module, which refuses to load without a secret.
# The real one is read from process.env at runtime.
RUN export BETTER_AUTH_SECRET=build-placeholder-not-a-real-secret && \
  pnpm prepare && pnpm build:all

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

# Derives each process's Deno permission set from the environment and execs it.
# Taken from the build context rather than the builder stage: it is shipped
# as-is and never passes through the bundler.
COPY --chown=uppity:uppity scripts/entrypoint.sh ./entrypoint.sh

USER 1001:1001
EXPOSE 3000/tcp
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# busybox wget, not `deno eval`. eval runs with implicit access to every
# permission and rejects the permission flags outright, so a probe written that
# way would be the one process in the image still running unrestricted, every
# thirty seconds. wget exits non-zero on a non-2xx status, which is the whole
# job. Shell form, so PORT expands.
#
# Workers run the same image but override CMD and don't serve HTTP, so this
# probe will fail for them — disable the healthcheck on worker containers in
# your deployment config.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["/bin/sh", "-c", "wget -q -O /dev/null \"http://127.0.0.1:${PORT}/api/health\""]

# Default to web server, override for workers:
#   docker run ... [image] ./entrypoint.sh worker-monitor
#   docker run ... [image] ./entrypoint.sh worker-notifier
CMD ["./entrypoint.sh", "serve"]
