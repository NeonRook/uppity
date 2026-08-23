# Uppity

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-3.0-4baaaa.svg)](CODE_OF_CONDUCT.md)

A self-hosted monitoring and status page application built with SvelteKit 2 and
Svelte 5.

## Features

- **Monitor Types**: HTTP, TCP, and push-based health checks
- **Incident Management**: Track and manage service incidents
- **Notifications**: Multi-channel alerts via Email, Slack, Discord, and
  Webhooks
- **Public Status Pages**: Customizable status pages for your customers
- **Multi-tenant**: Organization-based authentication with team support
- **Admin Panel**: Manage users and organizations

## Tech Stack

- **Runtime**: [Node](https://nodejs.org) for development and the build,
  [Deno](https://deno.com) inside the production image. See
  [ADR 0001](docs/adr/0001-node-aube-build-deno-runtime.md) for why the two
  differ; contributors only need Node.
- **Package manager**: [aube](https://aube.jdx.dev)
- **Framework**: [SvelteKit 2](https://svelte.dev/docs/kit) with
  [Svelte 5](https://svelte.dev)
- **Database**: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team)
- **Auth**: [better-auth](https://www.better-auth.com) with organization support
- **UI**: [shadcn-svelte](https://shadcn-svelte.com) components
- **Forms**: [sveltekit-superforms](https://superforms.rocks) with Valibot
  validation
- **i18n**:
  [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev) — `mise install` reads [`mise.toml`](mise.toml)
  and gives you Node and aube at the pinned versions. CI installs from the same
  file. You do not need Deno: it only runs inside the production image.
- [PostgreSQL](https://www.postgresql.org) (v15+) or use Docker

### Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/NeonRook/uppity.git
   cd uppity
   ```

2. **Install the toolchain and dependencies**

   ```bash
   mise install
   aube install
   ```

3. **Start PostgreSQL** (using Docker)

   ```bash
   docker compose -f docker-compose.dev.yml up -d
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
   aubr db:push
   ```

6. **Start the development server**

   ```bash
   aubr dev
   ```

   Open [http://localhost:5173](http://localhost:5173) in your browser.

## Development

### Commands

`aubr` is aube's script runner, the equivalent of `npm run`.

```bash
# Start dev server
aubr dev

# Type checking
aubr check

# Linting (with auto-fix)
aubr lint

# Linting and formatting as CI checks them, without fixing
aubr lint:ci

# Formatting
aubr fmt

# Run unit tests
aubr test:unit run

# Run e2e tests
aubr test:e2e

# Database GUI
aubr db:studio
```

### Project Structure

```
src/
├── lib/
│   ├── server/
│   │   ├── db/schema.ts        # Drizzle database schema
│   │   ├── services/           # Business logic layer
│   │   ├── notifications/      # Notification channel implementations
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

worker/                         # Long-lived processes, deployed separately
├── monitor/                    # Schedules and runs health checks
└── notifier/                   # Delivers queued notifications
```

## Deployment

### Docker

Build and run with Docker Compose:

```bash
# Set required environment variables
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
export BETTER_AUTH_URL=https://your-domain.com
export BETTER_AUTH_TRUSTED_ORIGINS=https://your-domain.com

# Only when a reverse proxy terminates TLS in front of Uppity. The server sees a
# plain http:// request on its own port, so without this it builds links and form
# actions against the container's internal address.
export ORIGIN=https://your-domain.com

# Start the full stack
docker compose up -d
```

Or build the image manually:

```bash
docker build \
  --build-arg VITE_BETTER_AUTH_URL=https://your-domain.com \
  -t uppity .
```

### Verifying the image

Published images carry a Sigstore-backed build provenance attestation. Verify
that an image was built by this repository's workflow, from this repository's
source, before running it:

```bash
gh attestation verify oci://ghcr.io/neonrook/uppity:latest --repo NeonRook/uppity
```

No keys to distribute and no trust in the registry required — the attestation is
signed by GitHub's OIDC identity for the workflow that produced it.

Images are published for `linux/amd64` and `linux/arm64`.

**Tags**

| Tag            | Contents                                               |
| -------------- | ------------------------------------------------------ |
| `latest`       | The most recent release                                |
| `0.2.0`, `0.2` | A specific release, and the newest patch on that minor |
| `edge`         | The current state of `main`. Not release-tested        |
| `main-<sha>`   | A specific commit on `main`                            |

For production self-hosting, pin the digest rather than a tag — a tag can be
repointed, a digest cannot:

```bash
docker pull ghcr.io/neonrook/uppity@sha256:<digest>
```

Each release's digest is printed in its GitHub release notes.

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

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md)
for details.

This project follows the
[Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the
[GNU Affero General Public License v3.0](LICENSE).

**Commercial licensing** is available for organizations that cannot use
AGPL-licensed software. Contact us for details.
