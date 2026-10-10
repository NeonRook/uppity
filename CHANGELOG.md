# Changelog

## 0.5.0

### Minor Changes

- [#135](https://github.com/NeonRook/uppity/pull/135) [`94e8e35`](https://github.com/NeonRook/uppity/commit/94e8e35bf278de8b4fb34179ba4c7ffbe8a7e667) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Monitors can now alert your notification channels. Until now there was no way to attach a channel, so no alerts were sent.

  - New monitors start with every enabled channel attached. On the monitor form you can detach channels and choose which events each one hears: down, recovered, degraded, and certificate expiry for HTTP monitors with the SSL check on.
  - A monitor's page lists where its alerts go, and warns when nobody will hear it go down.
  - A channel's page lists the monitors that alert it, so you can attach or detach many at once.

### Patch Changes

- [#132](https://github.com/NeonRook/uppity/pull/132) [`d81b9a9`](https://github.com/NeonRook/uppity/commit/d81b9a9b3a5531cda23c66f7b4efe7eb6120c8fa) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Email notification channels now deliver. Self-hosters on the published `docker-compose.yml` should pull the new file; if you run the notifier another way, give it the same `SMTP_*` variables as the app.

  Uppity now refuses to send SMTP credentials over a connection without TLS. Set `SMTP_FROM` to an address on your own domain; the fallback sender is now `noreply@uppity.cloud`.

- [#134](https://github.com/NeonRook/uppity/pull/134) [`b2c2849`](https://github.com/NeonRook/uppity/commit/b2c28490cabe737b63bfaf03d1a00d88b2c74ca9) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The published image can now reach your SMTP server. Before, it blocked the connection, so password reset and email alerts failed with `getaddrinfo EPERM`.

## 0.4.0

### Minor Changes

- [#125](https://github.com/NeonRook/uppity/pull/125) [`411d90d`](https://github.com/NeonRook/uppity/commit/411d90d196a77f3294ec256fcd4abd18eeb0e272) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Uppity plan customers can add monitor capacity from Billing settings, in blocks of 50 monitors at $8 a month or $80 a year, up to 40 blocks. Removing blocks takes effect at the end of the billing period, since each period is billed at the most blocks held during it. Annual customers confirm an increase before it applies, with the amount they'll pay at renewal. Owners and admins can change capacity; other members see it read-only.

- [#131](https://github.com/NeonRook/uppity/pull/131) [`741fcd6`](https://github.com/NeonRook/uppity/commit/741fcd679cf46891a1fb5e97fc0436be6cf0b62f) Thanks [@lucasvienna](https://github.com/lucasvienna)! - A monitor that Uppity itself repeatedly fails to check no longer goes quiet. Before, three failed attempts stopped its checks for 24 hours while the dashboard and the public status page kept showing its last status. It now keeps retrying every few minutes. Until a check succeeds, the dashboard and monitor pages show it as "Not checked" with the time of the next attempt, and the public status page shows it with no status and replaces "All systems operational" with "Some systems are not being monitored right now". The monitor's notification channels hear when checks stop and again when they resume. Webhooks receive these as `monitor_checks_stopped` and `monitor_checks_resumed`, and `monitor_checks_stopped` leaves `status` empty because the last recorded one is out of date.

  A check cut short by a worker restart or crash is now retried within about a minute, where it used to wait an hour. A notification that hits a database error while being sent is retried a few minutes later instead of being dropped.

  For operators, the admin area lists these monitors across organizations and can retry one immediately. Each one also logs an error with `event_type` set to `monitor_dead_lettered`, which a log alert can match. `UPPITY_DEAD_LETTER_HOURS` is no longer read and can be removed; `UPPITY_CHECK_BACKOFF_MAX_MS` (5 minutes by default) now sets how often these monitors retry. Upgrading runs a quick migration, and monitors currently held back by the old 24-hour rule are checked right away.

### Patch Changes

- [#127](https://github.com/NeonRook/uppity/pull/127) [`50c9696`](https://github.com/NeonRook/uppity/commit/50c969661bea5dbf7b065b8beb2af3b1d12d46b0) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Fixes a security issue in the admin area. Any signed-in account could read its data, including every user's email address, the organization list and the audit log. It could also use the admin forms, including changing another user's email address, editing organizations and their members, and resyncing subscriptions. The admin area now requires an admin account for every request. Operators should review the audit log for admin changes made by accounts that are not admins.

- [#124](https://github.com/NeonRook/uppity/pull/124) [`99498ed`](https://github.com/NeonRook/uppity/commit/99498eddfd046959eaa1d106aa6e189338f0d16e) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Groundwork for buying extra monitor capacity. Nothing changes for customers yet. Upgrading runs a short database migration on the subscription table.

- [#121](https://github.com/NeonRook/uppity/pull/121) [`41777ea`](https://github.com/NeonRook/uppity/commit/41777ea341ba37fcc7ad5c7066b56d397ae10988) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Groundwork for buying extra monitor capacity. Nothing changes for customers yet. Upgrading runs a short database migration on the subscription table.

- [#126](https://github.com/NeonRook/uppity/pull/126) [`f0b9939`](https://github.com/NeonRook/uppity/commit/f0b9939c5be37df06618c4b29cfe47c01844c6cf) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Security: fixed a flaw that let any signed-in user start a checkout for an organization they did not belong to. The resulting subscription could replace that organization's billing, and cancelling it could move the organization to Free while its real subscription kept being charged. Only owners and admins of an organization can now start a checkout or view its subscriptions, and subscription events from Polar change an organization only when they concern the subscription it is billed through.

  Instances running with Polar billing should check that every paid organization is billed to one of its own owners or admins. This release stops new mismatches but does not repair existing ones. Self-hosted instances without Polar billing were not affected.

- [#130](https://github.com/NeonRook/uppity/pull/130) [`71a8091`](https://github.com/NeonRook/uppity/commit/71a8091a01a84cb62b3a0f602124d7f276c15763) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Security: fixed flaws that let any signed-in user change another organization's incidents and status pages. An attacker could post updates to someone else's incident, which could resolve it and send that organization's notifications. They could rewrite any postmortem shown on a public status page, and add or remove monitors and groups on another organization's status page. By linking another organization's monitors to their own incidents and status pages, they could make a public status page show an outage that wasn't real, or show another organization's incidents, including ones never meant to be public. Incident and status page changes now apply only within your own organization, and public status pages no longer send internal page details to visitors.

  Status pages and notifications now ignore links between organizations, including ones that already exist, so nothing leaks after upgrading. Operators should still remove such links: status page monitors and incident monitors that join two organizations, and incident updates written by someone outside the incident's organization. The pull request linked from this entry has read-only queries that find them.

- [#128](https://github.com/NeonRook/uppity/pull/128) [`ec24651`](https://github.com/NeonRook/uppity/commit/ec246510fb79d8574de1411c0f72d5a4f6c57cc4) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Public status pages now show correct uptime for monitors with more than one day of history; the figure was wrong before. An incident affecting several monitors on the same page no longer lists each update more than once.

- [#129](https://github.com/NeonRook/uppity/pull/129) [`e3411c6`](https://github.com/NeonRook/uppity/commit/e3411c603a3b3585234bce16b2915fe9e7c7c978) Thanks [@lucasvienna](https://github.com/lucasvienna)! - HTTP monitors can use the OPTIONS method, which the method picker offered but saving rejected.

  The HTTP check timeout now also covers reading the response body. A monitor that checks the body for expected text now reports down when the body takes longer than its timeout to arrive, where before the check could wait indefinitely.

  Alert messages read the same across Discord, Slack and email, and every channel now shows when the event happened. Long titles and values are shortened to fit Slack's and Discord's limits instead of failing to send. The notification worker lets sends in progress finish before shutting down, so a redeploy no longer risks sending the same alert twice.

  Confirmation and error messages in the app now appear; they were silently dropped before. Monitor uptime shows two decimals and is rounded down, so any downtime keeps it below 100%. Incident update times on public status pages show correctly for viewers outside UTC.

  In the admin area, user pages load for every user, not only the first thousand, and role and plan selections are submitted once. Organization slugs created from settings drop punctuation instead of turning it into hyphens, as slugs elsewhere already did.

  Two unused endpoints are removed: the monitor dead-letter reset JSON endpoint and the monitor live-updates stream. Nothing in Uppity called either.

  Upgrading runs a migration that drops an unused table. The `UPPITY_DEFAULT_LIST_LIMIT`, `UPPITY_QUEUE_POLL_INTERVAL_MS` and `UPPITY_WORKER_POLL_INTERVAL_MS` variables were never read and are no longer documented; it is safe to remove them.

## 0.3.3

### Patch Changes

- [#119](https://github.com/NeonRook/uppity/pull/119) [`4f4ff09`](https://github.com/NeonRook/uppity/commit/4f4ff094ab8eb717ce5fe18c8f475a1c87224135) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Building from source now uses pnpm instead of aube. `mise install` provides it. The published image does not change.

## 0.3.2

### Patch Changes

- [`66c337a`](https://github.com/NeonRook/uppity/commit/66c337a07ee392ec1640eea1ee530fd954d533a7) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Building the image no longer takes a `VITE_BETTER_AUTH_URL` build argument, and the app no longer reads that variable. You can remove it from your build command and environment. `BETTER_AUTH_URL` is unchanged.

## 0.3.1

### Patch Changes

- [`ce9808d`](https://github.com/NeonRook/uppity/commit/ce9808d611452d9e62ffa3e81288e61cda130629) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The account issuer column added in the last release is gone again. The auth library that required it withdrew the requirement in its 1.7.3 release, and this upgrade drops the column and its index. The migration is quick and does not touch any other table.

- [#107](https://github.com/NeonRook/uppity/pull/107) [`011299b`](https://github.com/NeonRook/uppity/commit/011299b6a24b56fe0225680c5484fb144373d0d8) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The billing page shows the new plan as soon as you return from checkout. It no longer needs a manual reload to catch up.

- [#106](https://github.com/NeonRook/uppity/pull/106) [`aa58479`](https://github.com/NeonRook/uppity/commit/aa584797b442ebe7a6542e6226605ff5f1917895) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Groundwork for capacity blocks. Nothing changes in this release — blocks still cannot be bought.

- [`e83e3ec`](https://github.com/NeonRook/uppity/commit/e83e3ec70e1e28c6eca8197263872302aa755afe) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Building the image from source works again. aube, the package manager the build uses, moved to a new repository, and the build now fetches it from there.

## 0.3.0

### Minor Changes

- [#94](https://github.com/NeonRook/uppity/pull/94) [`3bfe414`](https://github.com/NeonRook/uppity/commit/3bfe4145f12ac422f5e8cb8ddf4a3d4f911cbadd) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The container now runs on Deno instead of Bun.

  If you run Uppity behind a reverse proxy that terminates TLS, check that `BETTER_AUTH_URL` is set to the public URL your users visit before upgrading. The previous runtime assumed HTTPS on its own; the new one takes the public URL from `BETTER_AUTH_URL`, or from `ORIGIN` if you prefer to set it separately. With neither, the server believes it is reachable at its internal address, and every form submission — including login — is rejected as cross-site. Nothing to do if Uppity is reachable directly, or if you already set `BETTER_AUTH_URL`, which the published `docker-compose.yml` does.

  If you override the container command to run the monitor or notifier workers, or you run migrations as a separate pre-deploy step, update those commands: `bun run ./build/worker-monitor.js` becomes `./entrypoint.sh worker-monitor`, and the same shape applies to the notifier and the migration step. The bundled web server is now started with `./entrypoint.sh serve`. The published `docker-compose.yml` and the Railway configs are already updated.

  The image grows from 165MB to 179MB, which is the cost of the move and was expected.

- [#99](https://github.com/NeonRook/uppity/pull/99) [`6542f2e`](https://github.com/NeonRook/uppity/commit/6542f2efde4628594dd29bbc809224540ba1ab28) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Container processes now start with only the access they need, instead of full access to the machine. The web server can reach your database, your mail server and the billing API, and nothing else on the network. It cannot write files, start subprocesses or load native code. Both workers keep unrestricted outbound network access, because checking monitors and delivering webhooks means connecting to whatever address you configure, but they give up everything else.

  The point of this is the web tier. Uppity's job is fetching addresses your users supply, so a flaw that tricks the server into fetching an address it should not is the failure worth guarding against. A request like that now fails at the runtime, before it reaches the network.

  Nothing new to configure. The list of permitted hosts is assembled when the container starts, from `DATABASE_URL`, `SMTP_HOST` and `SMTP_PORT`. If you later point Uppity at a service it did not previously contact, the connection is refused and the log names the host that was wanted.

  If you override the container command, to run one of the workers or to run migrations as a separate pre-deploy step, update it: `deno run -A ./build/worker-monitor.js` becomes `./entrypoint.sh worker-monitor`, and the same shape applies to the notifier (`worker-notifier`), the migration step (`migrate`) and the web server (`serve`). The published `docker-compose.yml` is already updated. Commands that invoke the bundles directly still work, but they run without any of the restrictions above.

### Patch Changes

- [#96](https://github.com/NeonRook/uppity/pull/96) [`a417341`](https://github.com/NeonRook/uppity/commit/a417341c21478751cfe979ac2e2cd89baf816c88) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Building the image from source no longer downloads every dependency twice; the dependency layer now caches the way the Dockerfile always intended.

- [#100](https://github.com/NeonRook/uppity/pull/100) [`5b7390c`](https://github.com/NeonRook/uppity/commit/5b7390c9aba89ab9880af9b47aaf0de53d6368e6) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The hosted service now applies pending database migrations as part of each deploy, before the new version takes traffic. Self-hosted installs already did this, through the published `docker-compose.yml`.

## 0.2.1

### Patch Changes

- [#92](https://github.com/NeonRook/uppity/pull/92) [`0ba0e94`](https://github.com/NeonRook/uppity/commit/0ba0e9438dff6f3868cc752b2ec6b9e3cd7c07dd) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Fixed uptime bands on status pages shifting by a day on instances running in a non-UTC timezone. A day on the band chart has always meant a UTC day, and it now stays one no matter what clock the host is set to. Instances left on UTC were never affected.

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
