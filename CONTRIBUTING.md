# Contributing to Uppity

Thank you for your interest in contributing to Uppity! This document provides
guidelines and information for contributors.

## Code of Conduct

This project adheres to the
[Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating,
you are expected to uphold this code.

## Contributor License Agreement (CLA)

Uppity uses dual-licensing (AGPL-3.0 for open source, commercial license for
enterprises). To enable this, we require contributors to sign a Contributor
License Agreement before we can merge contributions.

When you submit your first pull request, you'll be prompted to sign the CLA via
CLA Assistant.

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev) — `mise install` reads
  [`mise.toml`](mise.toml) and gives you Node and
  [aube](https://aube.jdx.dev) at the pinned versions
- [PostgreSQL](https://www.postgresql.org) v15+ (or use Docker)

The production image runs on Deno, but the dev loop does not: every command
below runs on Node, and you never invoke Deno directly.
[ADR 0001](docs/adr/0001-node-aube-build-deno-runtime.md) explains why the two
differ.

### Development Setup

1. Fork and clone the repository

   ```bash
   git clone https://github.com/YOUR_USERNAME/uppity.git
   cd uppity
   ```

2. Install the toolchain and dependencies

   ```bash
   mise install
   aube install
   ```

3. Start PostgreSQL

   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

4. Configure environment

   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

5. Push database schema

   ```bash
   aubr db:push
   ```

6. Start development server

   ```bash
   aubr dev
   ```

## Development Workflow

### Branch Naming

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring

### Making Changes

1. Create a new branch from `main`
2. Make your changes
3. Ensure tests pass: `aubr test:unit run`
4. Ensure type checking passes: `aubr check`
5. Ensure linting and formatting pass as CI checks them: `aubr lint:ci`

`aubr lint` fixes what it can, which hides problems CI reports. Run `lint:ci`
after your last edit.

### Commit Messages

We follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

- `feat(monitors): add ping monitor type`
- `fix(notifications): handle rate limiting in Slack channel`
- `docs(readme): update installation instructions`

### Changesets

Every pull request that changes behaviour needs a changeset. It records what changed and how the
version should move, and it becomes the changelog entry on release.

`CHANGELOG.md` is generated from `.changeset/` files by Changesets on release and should not be
hand-edited — entries from 0.1.1 onward are all generated this way; earlier entries follow
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

```bash
aubr changeset
```

Pick a bump level, write a short user-facing description, and commit the generated file in
`.changeset/`. Bump levels: `patch` for fixes, `minor` for new features, `major` for breaking
changes.

Pull requests that change no behaviour — documentation, CI, tests, refactors — do not need a
release. Add an empty changeset to record that decision:

```bash
aubr changeset --empty
```

A bot comments on your pull request with the bump it detected, or a note that it found none. The
comment is a prompt, not a gate: nothing blocks on it, and a maintainer can add a changeset for you
from a link in that comment.

### Pull Requests

1. Fill out the PR template completely
2. Link any related issues
3. Ensure all CI checks pass
4. Request review from maintainers
5. Address review feedback promptly

## Code Style

- **TypeScript**: Strict mode enabled, no `any` types
- **Svelte**: Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **Testing**: All new features require tests
- **Comments**: Write self-documenting code; add comments only for complex logic

### Linting and Formatting

```bash
# Format all files
aubr fmt

# Lint with auto-fix
aubr lint

# Check both without fixing, the way CI does
aubr lint:ci

# Type check
aubr check
```

## Testing

### Unit Tests

Unit tests need a PostgreSQL reachable at `DATABASE_URL`; each file runs against
its own database created from a migrated template.

```bash
# Run all unit tests
aubr test:unit run

# Run specific test file
aubr test:unit run src/lib/format.spec.ts

# Run tests in watch mode
aubr test:unit
```

### E2E Tests

```bash
aubr test:e2e
```

## Reporting Issues

### Bug Reports

- Use the bug report issue template
- Include steps to reproduce
- Include environment details (OS, Node version, browser)
- Include relevant logs or screenshots

### Feature Requests

- Use the feature request issue template
- Describe the use case
- Explain why existing features don't solve the problem

## Questions?

- Open a [GitHub Discussion](https://github.com/NeonRook/uppity/discussions)
- Check existing issues and discussions first

Thank you for contributing!
