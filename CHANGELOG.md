# Changelog

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
