# Stage 1: Install dependencies
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
WORKDIR /temp/dev
RUN bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
# Skip peer dependencies for the runtime tree. --production correctly excludes
# devDependencies, but production packages pull heavy optional peers that Bun
# installs by default: better-auth declares vitest and drizzle-kit as optional
# peers, and drizzle-kit brings esbuild. That was ~275MB and 35 CVE-carrying
# esbuild binaries in the runtime image, for tools nothing at runtime uses.
# Migrations use drizzle-orm's migrator (build/migrate.js), not drizzle-kit.
RUN printf '[install]\npeer = false\n' > /temp/prod/bunfig.toml
WORKDIR /temp/prod
RUN bun install --frozen-lockfile --production

# Stage 2: Build application
FROM base AS builder
WORKDIR /usr/src/app
COPY --from=install /temp/dev/node_modules node_modules
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
RUN groupadd --system --gid 1001 uppity && \
  useradd --system --uid 1001 --gid uppity uppity

# Copy built application and dependencies
COPY --from=install --chown=uppity:uppity /temp/prod/node_modules node_modules
COPY --from=builder --chown=uppity:uppity /usr/src/app/build ./build
COPY --from=builder --chown=uppity:uppity /usr/src/app/package.json .

# Copy drizzle for migrations (optional runtime migrations)
COPY --from=builder --chown=uppity:uppity /usr/src/app/drizzle ./drizzle
COPY --from=builder --chown=uppity:uppity /usr/src/app/drizzle.config.ts ./

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
