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

# Code Quality
bun run fmt                # Format all files (oxfmt + prettier)
bun run lint                # Lint with auto-fix (oxlint + eslint)

# Testing
bun run test:unit           # Run all unit tests
bun run test:unit run src/lib/format.spec.ts  # Run single test file

# Database (requires DATABASE_URL in .env)
bun run db:push             # Push schema changes to database
bun run db:studio           # Open Drizzle Studio GUI

# Build
bun run build               # Production build (uses svelte-adapter-bun)
```

## Architecture

### Tech Stack

- **Runtime:** Bun (use Bun APIs like `Bun.connect()` instead of Node.js `net`/`tls`)
- **Framework:** SvelteKit 2 with Svelte 5
- **Database:** PostgreSQL via Drizzle ORM
- **Auth:** better-auth with organization support
- **UI:** shadcn/svelte components in `src/lib/components/ui/`
- **Forms:** sveltekit-superforms with Zod validation
- **i18n:** Paraglide for internationalization (`src/lib/paraglide/`)

### Directory Structure

```
src/lib/
├── server/
│   ├── db/schema.ts              # Drizzle schema (monitors, incidents, etc.)
│   ├── services/                 # Business logic layer
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
- **Background Jobs:** Monitor checks scheduled via node-cron in `scheduler.ts`

### Superforms Pattern

Forms use sveltekit-superforms. The correct pattern:

```svelte
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { untrack } from 'svelte';

  let { data } = $props();
  const { form, errors, message, enhance, delayed } = superForm(untrack(() => data.form));
</script>

<form method="POST" use:enhance>
  <input bind:value={$form.name} disabled={$delayed} />
  {#if $errors.name}<span class="error">{$errors.name}</span>{/if}
  {#if $message}<Alert variant="destructive">{$message}</Alert>{/if}
</form>
```

For edit forms, add `resetForm: false` to preserve values after submission.

### Testing

Tests use Vitest with two projects:

- **Server tests:** `*.spec.ts` files run in Node environment
- **Client tests:** `*.svelte.spec.ts` files run in browser via Playwright

All tests require assertions (`expect.requireAssertions: true`).

## Svelte MCP Tools

Use the Svelte MCP server for documentation and code validation:

1. **list-sections** - Discover available Svelte/SvelteKit documentation sections. Call this FIRST when working on Svelte topics.

2. **get-documentation** - Fetch full documentation for specific sections. Analyze use_cases from list-sections to fetch ALL relevant docs.

3. **svelte-autofixer** - Validate Svelte code before committing. Call repeatedly until no issues are returned.

4. **playground-link** - Generate Svelte Playground links. Only use after user confirmation and never for code written to project files.
