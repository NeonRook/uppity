# Changelog

## 0.2.0

### Minor Changes

- [#80](https://github.com/NeonRook/uppity/pull/80) [`81be763`](https://github.com/NeonRook/uppity/commit/81be7630e94f1183621200f18a6d8764f26ccd0a) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Upgrading runs a database migration that changes how Uppity records which sign-in
  method an account belongs to. It locks the accounts table while it runs, but that
  table holds one row per user, so on any normal instance it finishes in well under
  a second. Back up first regardless.

  A standard install needs nothing from you. Existing email and password accounts
  are converted in place, and everyone signs in exactly as before. Customers see no
  change at all.

  Forks that added a social or single sign-on provider are the exception. The
  migration refuses to guess at those accounts and stops with an error naming what
  it could not classify, so you can set the right values and run it again. Guessing
  was the other option, and it would have produced accounts that quietly fail to
  link on the next sign-in rather than an upgrade that stops while you are watching.

## 0.1.6

### Patch Changes

- [#75](https://github.com/NeonRook/uppity/pull/75) [`ae1a88b`](https://github.com/NeonRook/uppity/commit/ae1a88bb6d646911b86a5e1aa191fea41c2d54a6) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Groundwork for buying extra monitor capacity on the Uppity plan. Nothing changes yet: plan limits are exactly what they were, and self-hosted instances remain unlimited as always. Upgrading runs one quick database migration and needs nothing from you.

- [#77](https://github.com/NeonRook/uppity/pull/77) [`dd3891d`](https://github.com/NeonRook/uppity/commit/dd3891d233a9f3eb2378f0b02154d2a46af113a6) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The Docker image now applies Alpine security updates at build time, clearing the openssl advisory CVE-2026-45447.

## 0.1.5

### Patch Changes

- [#71](https://github.com/NeonRook/uppity/pull/71) [`8c8e36c`](https://github.com/NeonRook/uppity/commit/8c8e36c9ab258496971839cdec9929e053d763d7) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Update internal dependencies

- [#73](https://github.com/NeonRook/uppity/pull/73) [`5569de0`](https://github.com/NeonRook/uppity/commit/5569de09643a475ad3ab0a56fd49beba6103049d) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Fix the container image build, which had been failing since `@inlang/paraglide-js` moved to 2.24.0.
  That release pulls in `@inlang/sdk` 3, which replaced the WASM SQLite in `@lix-js/sdk` with a native
  addon whose prebuilt binaries are glibc-only, so message compilation could not run under Alpine. The
  build stages now use the Debian-based `oven/bun:1`; the runtime image is unchanged, still Alpine and
  still 165MB, because it only ever copies `build/` and `drizzle/` out of the builder.

## 0.1.4

### Patch Changes

- [#68](https://github.com/NeonRook/uppity/pull/68) [`72a2ce9`](https://github.com/NeonRook/uppity/commit/72a2ce97a4f040cfda18e7a3303512dcfd735259) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Shrink the runtime Docker image from 169MB to 165MB (46.2MB to 43.8MB pulled) and drop `node_modules` from it entirely. `auth.ts` now builds from `better-auth/minimal`, which removes Kysely and its unused sqlite/mysql/mssql dialects from the server bundle, and `@opentelemetry/api` is bundled rather than externalised — Vite resolves its ESM build, so better-auth's dynamic import still gets genuine named exports. With nothing left to exempt, the runtime allowlist is empty and the image ships only `build/`, `drizzle/` and a minimal manifest.

- [#66](https://github.com/NeonRook/uppity/pull/66) [`7cf5314`](https://github.com/NeonRook/uppity/commit/7cf531432894ba3a438356c521f522aecd5618b9) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Finish the maintenance window CRUD UI (NEO-11). An active window now renders in Ward Blue instead of the emerald that means "operational", and a cancelled one no longer borrows the scarlet reserved for a monitor that is down. Windows that have not started can be deleted outright; anything that has already suppressed an alert can only be cancelled, so the record of why alerting went quiet survives.

  The monitor selector gained a filter, a selected count and a clear action — it was an unfiltered checkbox list, which does not survive the 2,000 monitors a Dedicated plan allows — and finished windows now list the monitors they covered instead of rendering every monitor as a disabled checkbox. Times, durations and the newly shown window length are set in mono per the Measured-Value Rule, upcoming windows sort soonest-first, and an organisation with no windows sees one empty state rather than four.

  Service rejections now carry stable codes and are translated through Paraglide across `en`, `de` and `pt-br`; previously the raw English strings reached the form. `datetime-local` fields name the browser's time zone, which they never did. Cancel and delete moved to remote commands, matching every other row action in the app.

## 0.1.3

### Patch Changes

- [#64](https://github.com/NeonRook/uppity/pull/64) [`87b3b2a`](https://github.com/NeonRook/uppity/commit/87b3b2a2982fb3608794b21e3865c7fd85e1b08f) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Shrink the runtime Docker image from 726MB to 169MB. The SSR graph is now fully bundled instead of externalised, so the image ships no dependency tree beyond `@opentelemetry/api` — the one package that must resolve at run time. The base image moved to `oven/bun:1-alpine`, server sourcemaps are no longer shipped, and a new build-time check (`check:externals`) fails the build if the server bundle imports anything the image will not contain.

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
