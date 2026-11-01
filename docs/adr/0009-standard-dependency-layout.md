---
status: accepted
date: 2026-11-01
---

# The image ships production dependencies

The build leaves dependencies external and the image installs `dependencies` from the lockfile.
This replaces the bundle-everything layout of ADR 0001 and ADR 0008. `check-externals` stays, and
now fails the build on a bare import that is not in `dependencies`.

## Context

The image shipped no `node_modules`, which cut its size while the runner was Deno. Node's binary
removed most of that advantage (ADR 0008).

OpenTelemetry does not fit that layout. SvelteKit forces `@opentelemetry/api` external so its
runtime and the instrumentation share one instance, and the OTel SDK imports that package
statically. Auto-instrumentation also needs real imports to intercept: inlined, pino has no import
for `import-in-the-middle` to wrap.

## Decision

- **Standard SSR output.** No `ssr.noExternal` in either Vite config.
- **Telemetry loads with `--import`.** `build/telemetry.js` starts the OTel SDK before the entry
  point in `serve` and both workers. `src/instrumentation.server.ts` is not used, because adapter-node
  wraps its own `index.js` with it and `serve` loads `handler.js`. Kit's spans reach the same
  global tracer provider.
- **One Dash0 dataset.** `deployment.environment.name` separates staging from production.
- **Server and browser report the same deployment.** Both send the service version, environment,
  deployment name and ID, and the `vcs.*` attributes, from `src/lib/server/deployment.ts`.
- **Logs are filtered in the process.** Only warnings, errors and the heartbeat leave, reduced to
  an allowlist of fields. Pino still writes everything to stdout.
- **The Web SDK runs in the signed-in app only.** It keeps a session ID in browser storage, so it
  stays off public status pages, whose visitors have no relationship with us.

## Consequences

- Every process can read `./node_modules`, and a compromised dependency is on disk in the image
  rather than only where the bundler placed it. Writes, child processes, worker threads and native
  addons stay denied.
- The image scan now covers the full production dependency tree.
- A production dependency that needs a native addon fails at load under `--permission`.
- `prod-deps` installs on Debian and the runner is Alpine, so a dependency with glibc-only native
  code would fail there too.
