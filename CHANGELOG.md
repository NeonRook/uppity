# Changelog

## 0.1.2

### Patch Changes

- [#59](https://github.com/NeonRook/uppity/pull/59)
  [`de73444`](https://github.com/NeonRook/uppity/commit/de73444c40411cdd8f13b04c9af07be2ea9aca60)
  Thanks [@lucasvienna](https://github.com/lucasvienna)! - Shrink the container
  image from 1.11 GB to 726 MB. The runtime image was installing optional peer
  dependencies of production packages — including `vitest`, `drizzle-kit` and
  `esbuild` — which added roughly 275 MB and 35 vulnerable esbuild binaries that
  nothing at runtime used. Database migrations now run through `drizzle-orm`'s
  migrator rather than `drizzle-kit`.

## 0.1.1

### Patch Changes

- [#55](https://github.com/NeonRook/uppity/pull/55)
  [`70143b8`](https://github.com/NeonRook/uppity/commit/70143b8eb60bfd5d57b74846be32df81ea1eca81)
  Thanks [@lucasvienna](https://github.com/lucasvienna)! - Rework the release
  pipeline: pull-request checks are now gated separately from publishing, and
  container images are built for amd64 and arm64 with a verifiable build
  provenance attestation.

## [0.1.0] - 2026-01-27

### Added

- Initial public release
- HTTP, TCP, and push-based monitor health checks
- Incident tracking and management
- Multi-channel notifications (Email, Slack, Discord, Webhooks)
- Public status pages for customers
- Organization-based multi-tenant authentication
- Admin panel for user and organization management
- Docker and Docker Compose deployment support

[0.1.0]: https://github.com/NeonRook/uppity/releases/tag/v0.1.0
