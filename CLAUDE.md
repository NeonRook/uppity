# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Uppity is a self-hosted monitoring and status page application built with SvelteKit 2 and Svelte 5. It provides:
- HTTP, TCP, and push-based monitor health checks
- Incident tracking and management
- Multi-channel notifications (Email, Slack, Discord, Webhooks)
- Public status pages for customers
- Organization-based multi-tenant authentication

## Common Commands

```bash
# Development
bun run dev                 # Start dev server at localhost:5173
bun run check               # Type check with svelte-check
bun run check:watch         # Watch mode type checking

# Code Quality
bun run fmt                 # Format all files (oxfmt + prettier)
bun run lint                # Lint with auto-fix (oxlint + eslint)
bun run lint:ci             # CI linting (strict, no auto-fix)

# Testing
bun run test:unit           # Run unit tests with Vitest
bun run test:e2e            # Run E2E tests with Playwright
bun run test                # Run all tests

# Database (requires DATABASE_URL in .env)
bun run db:push             # Push schema changes to database
bun run db:generate         # Generate migration files
bun run db:migrate          # Run pending migrations
bun run db:studio           # Open Drizzle Studio GUI

# Build
bun run build               # Production build (uses svelte-adapter-bun)
bun run preview             # Preview production build
```

## Architecture

### Tech Stack
- **Runtime:** Bun
- **Framework:** SvelteKit 2 with Svelte 5
- **Database:** PostgreSQL via Drizzle ORM
- **Auth:** better-auth with organization support
- **UI:** shadcn/svelte components in `src/lib/components/ui/`
- **Forms:** sveltekit-superforms with Zod/Valibot validation

### Directory Structure
```
src/lib/
├── server/
│   ├── db/schema.ts              # Drizzle schema (monitors, incidents, etc.)
│   ├── services/                 # Business logic layer
│   │   ├── monitor.service.ts
│   │   ├── incident.service.ts
│   │   ├── notification-channel.service.ts
│   │   └── status-page.service.ts
│   ├── notifications/            # Channel implementations (email, slack, discord, webhook)
│   ├── jobs/scheduler.ts         # node-cron background health checks
│   └── auth.ts                   # better-auth configuration
├── schemas/                      # Zod validation schemas for forms/API
└── components/ui/                # shadcn/svelte components

src/routes/
├── (app)/                        # Protected routes (dashboard, monitors, incidents, etc.)
├── (auth)/                       # Login/register
├── (public)/status/[slug]/       # Public status pages
└── api/                          # API endpoints
```

### Key Patterns
- **Service Layer:** Routes delegate to services in `src/lib/server/services/`
- **Schema Validation:** Zod schemas in `src/lib/schemas/` used by superforms
- **Real-time Updates:** Server-Sent Events via `src/lib/server/sse.ts`
- **Background Jobs:** Monitor checks scheduled via node-cron in `scheduler.ts`

## Svelte MCP Tools

Use the Svelte MCP server for documentation and code validation:

1. **list-sections** - Discover available Svelte/SvelteKit documentation sections. Call this FIRST when working on Svelte topics.

2. **get-documentation** - Fetch full documentation for specific sections. Analyze use_cases from list-sections to fetch ALL relevant docs.

3. **svelte-autofixer** - Validate Svelte code before committing. Call repeatedly until no issues are returned.

4. **playground-link** - Generate Svelte Playground links. Only use after user confirmation and never for code written to project files.
