# Runtime permissions

The production image runs on Deno, so each process starts with no access to the network, the
filesystem or the environment and is granted back only what it needs. `scripts/entrypoint.sh`
holds the sets and is the only thing that launches application code in the container.

Nothing runs with `-A`.

## The four processes

| Process           | `--allow-net`                                    | `--allow-read`              |
| ----------------- | ------------------------------------------------ | --------------------------- |
| `serve`           | listening socket, Postgres, SMTP host, Polar API | `./.deno-deploy`, `./build` |
| `migrate`         | Postgres                                         | `./drizzle`, `./build`      |
| `worker-monitor`  | unrestricted                                     | `./build`                   |
| `worker-notifier` | unrestricted                                     | `./build`                   |

All four also get `--allow-env` and `--allow-sys=hostname`. None gets `--allow-write`,
`--allow-run`, `--allow-ffi` or `--allow-import`.

Run `UPPITY_PRINT_PERMISSIONS=1 ./scripts/entrypoint.sh serve` to print the exact command for a
given environment instead of executing it.

## Why each grant exists

**The listening socket.** Binding a port is a network operation, so `HOST:PORT` needs its own
entry or `Deno.serve` fails at startup.

**Postgres, SMTP and Polar.** These hosts are not known when the image is built. They arrive as
`DATABASE_URL`, `SMTP_HOST` and `POLAR_SERVER`, so the entrypoint reads them at container start
and assembles the allowlist from them. An instance with no `POLAR_ACCESS_TOKEN` never calls
Polar, so the Polar host is left off the list entirely rather than allowed and unused.

**`--allow-read` on `./build` and `./.deno-deploy`.** The bundle and its chunks live in `build/`;
the SSR chunks and the static assets named in `.deno-deploy/deploy.json` live alongside them.
Migrations are read from `./drizzle`, which only `migrate` needs.

**`--allow-sys=hostname`.** The logger reads the host name once, when it builds the base fields
it stamps on every line. This is the only `sys` call anywhere in the four bundles.

**`--allow-env`, unrestricted.** The Deno adapter's generated handler passes SvelteKit its
dynamic environment with `Deno.env.toObject()`, which reads the whole environment and fails
under an allowlist of any length. The workers do not go through the adapter and could be
narrowed, but development runs on Node, where Deno's permissions do not exist, so a missing
entry would first appear in production. The environment holds only what these processes already
need, which makes this the cheapest grant to give up.

## Why the workers keep unrestricted network access

`worker-monitor` probes whatever URL a user typed into the monitor form. `worker-notifier` posts
to whatever Discord, Slack or webhook endpoint a user configured. Both are the product working
as designed, and no allowlist can describe "any address a customer might add later".

This is deliberate, not an oversight. What the workers still give up is `write`, `run`, `ffi`
and `import`.

The tier worth locking down is the one that accepts public traffic, and that one has a closed
list. Uppity's job is fetching addresses supplied by users, which is SSRF-shaped by
construction, so a runtime allowlist on the web tier turns a request-forgery gadget in a route
handler into a `NotCapable` error instead of an outbound connection.

## Changing it

Adding an outbound call to the web tier means adding its host to `serve`'s allowlist in
`scripts/entrypoint.sh`. Because `aubr dev` runs on Node, a missing entry will not show up
locally; it shows up as `NotCapable: Requires net access to "…"` in the container. The same goes
for a dependency that starts reading a new file or making a new `sys` call.

## The healthcheck

The container healthcheck uses busybox `wget`, not `deno eval`. `deno eval` runs with implicit
access to every permission and rejects the permission flags outright, so writing the probe in
Deno would leave one unrestricted process starting every thirty seconds for no benefit.
