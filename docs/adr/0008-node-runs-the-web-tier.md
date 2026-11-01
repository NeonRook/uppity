---
status: accepted
date: 2026-10-12
---

# Node runs the web tier in production

The production image runs `serve` and `migrate` on Node, through `@sveltejs/adapter-node`. This
supersedes the runtime half of ADR 0001. The build half stands, with pnpm per ADR 0003. ADR 0009
replaces the bundling described here.

## Context

Cloudflare acquired Deno in October 2026. The runtime gets fixes and security updates for one
year, then official development ends. ADR 0001 chose Deno for the runner only, on image size,
and the runner executes a pre-bundled artifact, so leaving it changes the runner stage and
nothing in the dev loop.

The workers run from the same image, now on Node, under the same permission model.

ADR 0001 also leaned on Deno's per-process `--allow-*` sets, which gave the web tier a closed
list of hosts it could reach. Whether Node can keep that was the open question.

## What Node's permission model offers

Measured on 2026-10-12 against Node 24.19.0, 25.9.0 and 26.11.1.

| Line | `--permission`                 | Network under `--permission`  |
| ---- | ------------------------------ | ----------------------------- |
| 24   | stable, filesystem and process | not covered: always allowed   |
| 25   | stable                         | `--allow-net`, all or nothing |
| 26   | stable                         | `--allow-net`, all or nothing |

Node 24 has no network permission at all. From 25, `--permission` denies sockets and DNS unless
`--allow-net` is given, but the flag takes no host list and is marked experimental. It also
ignores a value silently: `--allow-net=8.8.8.8` still connected to `1.1.1.1`. Nothing on any
line can express "Postgres, the SMTP host and Polar, and nothing else".

## Decision

- **The per-host network allowlist is given up.** `serve` and `migrate` get `--allow-net` and can
  reach any address. A request-forgery gadget in a route handler is no longer stopped by the
  runtime.
- **The rest of the permission model is kept.** Both run under `--permission`, with reads scoped
  to `./build` (and `./drizzle` for `migrate`). Filesystem writes, child processes, worker
  threads, native addons, WASI, FFI and the inspector are denied. A compromised dependency can
  still make outbound connections, but cannot write, persist, or execute anything outside the
  bundle.
- **The workers run under the same flags.** They need unrestricted network access to reach the
  URLs and endpoints users configure, so the model restricts only their filesystem and process
  access, as Deno's sets did.
- **The runner is `alpine` with the `node` binary copied from the official Alpine image.** The
  official image bundles npm, which the runner never uses, and deleting it in a later layer
  saves nothing. Both stages name the same Alpine release, since the binary links against its
  musl.

## Image size

Measured on 2026-10-12 with the same build output. Deno 2.9.7 against Node 26.11.1.

|                        | Deno  | Node  |
| ---------------------- | ----- | ----- |
| `docker images`        | 187MB | 244MB |
| Compressed (pulled)    | 55MB  | 63MB  |
| Root filesystem (`du`) | 119MB | 167MB |
| Runtime binary         | 91MB  | 139MB |

The Node image is about 57MB larger on disk and 8MB larger to pull. The difference is the binary.
This is accepted: it is the cost of a runtime with a future.

## Consequences

- adapter-node fixes its origin at build time and otherwise assumes `https` and the `Host`
  header, which would break plain-HTTP deployments and drop `ORIGIN`. `serve` is therefore a
  small server of our own around adapter-node's request handler. When `ORIGIN` is set, every
  request is handled as that origin, through header names the server sets and overwrites so
  clients cannot spoof them. Unset, adapter-node's `PROTOCOL_HEADER` and `HOST_HEADER` apply.
  The server mirrors adapter-node's `HOST`, `PORT`, timeouts and graceful shutdown; it does not
  support `SOCKET_PATH`, systemd socket activation or `IDLE_TIMEOUT`.
- adapter-node externalises every package in `dependencies`. The SSR build passes a pattern to
  `ssr.noExternal` so it does not, and `scripts/check-externals.ts` still fails the build on any
  bare import that survives.
- The SMTP transport no longer dials by host name to satisfy a per-host allowlist.
- `--allow-net` prints an experimental warning once at startup.
- A pino transport runs in a worker thread, which `--permission` denies. OTLP logs leave from the
  main thread instead (ADR 0009).

## Revisit when

Node ships a network allowlist that takes hosts. Then the closed list for `serve` comes back:
Postgres, the listening socket, the SMTP hosts, and Polar when a token is set.
