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

- [Bun](https://bun.sh) v1.0+
- [PostgreSQL](https://www.postgresql.org) v15+ (or use Docker)
- [pnpm](https://pnpm.io) (for formatting commands only)

### Development Setup

1. Fork and clone the repository

   ```bash
   git clone https://github.com/YOUR_USERNAME/uppity.git
   cd uppity
   ```

2. Install dependencies

   ```bash
   bun install
   ```

3. Start PostgreSQL

   ```bash
   docker compose up -d
   ```

4. Configure environment

   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

5. Push database schema

   ```bash
   bun run db:push
   ```

6. Start development server

   ```bash
   bun run dev
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
3. Ensure tests pass: `bun run test:unit -- --run`
4. Ensure linting passes: `bun run lint`
5. Ensure type checking passes: `bun run check`
6. Format your code: `pnpm run fmt`

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
pnpm run fmt

# Lint with auto-fix
bun run lint

# Type check
bun run check
```

## Testing

### Unit Tests

```bash
# Run all unit tests
bun run test:unit

# Run specific test file
bun run test:unit -- --run src/lib/server/services/check.service.spec.ts

# Run tests in watch mode
bun run test:unit -- --watch
```

### E2E Tests

```bash
bun run test:e2e
```

## Reporting Issues

### Bug Reports

- Use the bug report issue template
- Include steps to reproduce
- Include environment details (OS, Bun version, browser)
- Include relevant logs or screenshots

### Feature Requests

- Use the feature request issue template
- Describe the use case
- Explain why existing features don't solve the problem

## Questions?

- Open a [GitHub Discussion](https://github.com/NeonRook/uppity/discussions)
- Check existing issues and discussions first

Thank you for contributing!
