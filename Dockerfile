# Stage 1: Install dependencies
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Stage 2: Build application
FROM base AS builder
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
# VITE_ prefixed vars are client-side and must be set at build time
ARG VITE_BETTER_AUTH_URL="https://localhost:3000"
ENV VITE_BETTER_AUTH_URL=$VITE_BETTER_AUTH_URL
RUN bun --bun run prepare && bun --bun run build:all

# Stage 3: Production image
FROM base AS runner
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

# Default to web server, override for workers:
#   docker run ... [image] bun run ./build/worker-monitor.js
#   docker run ... [image] bun run ./build/worker-notifier.js
CMD ["bun", "--bun", "run", "./build/index.js"]
