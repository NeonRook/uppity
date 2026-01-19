# Uppity

A self-hosted monitoring and status page application built with SvelteKit 2 and Svelte 5.

## Features

- **Monitor Types**: HTTP, TCP, and push-based health checks
- **Incident Management**: Track and manage service incidents
- **Notifications**: Multi-channel alerts via Email, Slack, Discord, and Webhooks
- **Public Status Pages**: Customizable status pages for your customers
- **Multi-tenant**: Organization-based authentication with team support
- **Admin Panel**: Manage users and organizations

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: [SvelteKit 2](https://svelte.dev/docs/kit) with [Svelte 5](https://svelte.dev)
- **Database**: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team)
- **Auth**: [better-auth](https://www.better-auth.com) with organization support
- **UI**: [shadcn-svelte](https://shadcn-svelte.com) components
- **Forms**: [sveltekit-superforms](https://superforms.rocks) with Valibot validation
- **i18n**: [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [PostgreSQL](https://www.postgresql.org) (v15+) or use Docker

### Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/NeonRook/uppity.git
   cd uppity
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Start PostgreSQL** (using Docker)

   ```bash
   docker compose up -d
   ```

4. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at minimum:
   - `DATABASE_URL` - PostgreSQL connection string (default works with Docker)
   - `BETTER_AUTH_SECRET` - Generate with `openssl rand -base64 32`

5. **Push database schema**

   ```bash
   bun run db:push
   ```

6. **Start the development server**

   ```bash
   bun run dev
   ```

   Open [http://localhost:5173](http://localhost:5173) in your browser.

## Development

### Commands

```bash
# Start dev server
bun run dev

# Type checking
bun run check

# Linting (with auto-fix)
bun run lint

# Formatting (use pnpm for this command)
pnpm run fmt

# Run unit tests
bun run test:unit

# Run e2e tests
bun run test:e2e

# Database GUI
bun run db:studio
```

### Project Structure

```
src/
├── lib/
│   ├── server/
│   │   ├── db/schema.ts        # Drizzle database schema
│   │   ├── services/           # Business logic layer
│   │   ├── notifications/      # Notification channel implementations
│   │   ├── jobs/scheduler.ts   # Background job scheduler
│   │   └── auth.ts             # Authentication configuration
│   ├── schemas/                # Validation schemas
│   └── components/ui/          # shadcn-svelte components
└── routes/
    ├── (app)/                  # Protected application routes
    │   ├── dashboard/          # Main dashboard
    │   ├── monitors/           # Monitor management
    │   ├── incidents/          # Incident tracking
    │   ├── notifications/      # Notification channels
    │   ├── status-pages/       # Status page configuration
    │   └── settings/           # User settings
    ├── (auth)/                 # Login and registration
    ├── (admin)/                # Admin panel
    ├── (public)/status/[slug]/ # Public status pages
    └── api/                    # API endpoints
```

## Deployment

### Docker

Build and run with Docker Compose:

```bash
# Set required environment variables
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
export BETTER_AUTH_URL=https://your-domain.com
export BETTER_AUTH_TRUSTED_ORIGINS=https://your-domain.com

# Start with production compose file
docker compose -f docker-compose.prod.yml up -d
```

Or build the image manually:

```bash
docker build \
  --build-arg VITE_BETTER_AUTH_URL=https://your-domain.com \
  -t uppity .
```

### Environment Variables

See [`.env.example`](.env.example) for all available configuration options.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Auth secret key (min 32 characters)
- `BETTER_AUTH_URL` - Public URL of your application

**Optional:**
- `SMTP_*` - Email notification settings
- `UPPITY_DEFAULT_*` - Monitor default configurations
- `UPPITY_CRON_*` - Background job schedules

## License

MIT
