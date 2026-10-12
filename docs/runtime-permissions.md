# Runtime permissions

The production image runs on Node. `serve` and `migrate` start under Node's permission model
(`--permission`), which denies everything not granted on the command line.
`scripts/entrypoint.sh` holds the flags and is the only thing that launches application code in
the container.

## The four processes

| Process           | `--permission` | Reads                  | Network      |
| ----------------- | -------------- | ---------------------- | ------------ |
| `serve`           | yes            | `./build`              | unrestricted |
| `migrate`         | yes            | `./drizzle`, `./build` | unrestricted |
| `worker-monitor`  | yes            | `./build`              | unrestricted |
| `worker-notifier` | yes            | `./build`              | unrestricted |

Under `--permission`, no process can write to the filesystem, spawn processes,
start worker threads, load native addons, or use WASI, FFI or the inspector.

Run `UPPITY_PRINT_PERMISSIONS=1 ./scripts/entrypoint.sh serve` to print the exact command instead
of executing it.

## Why each grant exists

**Reads on `./build`.** The server bundle, its chunks and the static assets all live there.
Migrations are read from `./drizzle`, which only `migrate` needs.

**The network, unrestricted.** Both processes need Postgres, and `serve` also binds its port and
calls the SMTP hosts and the Polar API. Node's `--allow-net` is a single switch with no host list,
and it is still marked experimental, so it prints one warning at startup. ADR 0008 records why the
per-host allowlist was given up.

Environment variables and the host name are not covered by Node's permission model, so they need
no grant.

## The workers' network

`worker-monitor` probes whatever URL a user typed into the monitor form, and `worker-notifier`
posts to whatever Discord, Slack or webhook endpoint a user configured. Unrestricted network access
is what they are for, so the permission model restricts only their filesystem and process access.

The application restricts where those connections go instead. Checks and notification deliveries
resolve each host once and refuse it if any address is private, loopback, link-local, unique local,
CGNAT, multicast, reserved or documentation space, including IPv6 forms that carry such an IPv4
address. They then connect only to the addresses they checked, on every redirect hop.
`UPPITY_ALLOW_PRIVATE_TARGETS=true` lifts the rule, for a self-hosted instance that monitors its own
network.

## Extra CA certificates

Set `NODE_EXTRA_CA_CERTS` to a PEM file to trust a private CA in checks and deliveries. Node reads
the file once at startup, before the permission model applies, so it needs no `--allow-fs-read`
grant. `scripts/entrypoint.spec.ts` runs a TLS handshake under the workers' flags to hold this true.

## Changing it

`pnpm dev` runs without the permission model, so a dependency that starts writing a file,
spawning a process or loading a native addon works locally and fails in the container with
`ERR_ACCESS_DENIED`. Grant the narrowest flag in `scripts/entrypoint.sh` and record it here.

## The healthcheck

The container healthcheck uses busybox `wget`. A probe written in Node would start a second
process outside the permission model every thirty seconds.
