---
status: accepted
date: 2026-08-22
---

# Build on Node with aube, run on Deno

Uppity builds its dev and CI toolchain on Node with [aube](https://aube.jdx.dev/) as the
package manager, and ships a production image whose runtime is Deno. Bun is removed from
both roles.

The split is deliberate and it is the part a future reader will question, so it is recorded
here: the build toolchain and the production runtime are chosen against different criteria,
and no single runtime currently wins both.

## Context

Bun was acquired by Anthropic in December 2025, and its stated roadmap now prioritises Claude
Code and the Agent SDK. Uppity's shape is a poor match for that direction. Two of its three
processes are long-lived polling daemons (`worker-monitor`, `worker-notifier`) that are
expected to run for months without restarting, and the reported post-acquisition complaints
cluster on memory retention and issue backlog. A monitoring product that dies quietly is
worse than one that never shipped.

The concern is not purely reputational. `bunfig.toml` existed solely to restore `.env` loading
for `bun run` scripts after Bun 1.3.10 removed it in a patch release. A config file whose only
job is to undo a breaking change in a patch bump is evidence about release discipline.

Bun's coupling was already shallow, because the seams were built early: `Bun.connect` was
isolated in a single wrapper module so tests could mock it without the Bun runtime, and
`check-externals.ts` deliberately separated its pure policy functions from Bun's parser so
they could run under Node in Vitest.

## Decision

Two runtimes, chosen separately.

**Build, dev, and CI run on Node with aube.** This is where the ecosystem risk lives: Vite,
Vitest browser mode, Playwright, drizzle-kit, and paraglide's native addon all stay on the
runtime they are tested against.

**The production runner stage runs Deno.** It executes a pre-bundled artifact and resolves no
dependencies at runtime, so Deno's Node compatibility gaps have almost nothing to act on.

aube manages `node_modules` for the build only. The runner ships no `node_modules` at all, so
the two package resolution models never coexist in one process.

Keep the lockfile in `pnpm-lock.yaml` format rather than letting aube default to
`aube-lock.yaml`. aube reads and writes it in place, which keeps pnpm available as a drop-in
fallback without a migration.

## Considered options

Measured on 2026-08-22 with deno 2.9.5, aube 1.41.0, vite 8.2.2, @sveltejs/kit 2.70.3. Build
verification ran on node 26.7.0; image figures use `node:24-alpine`, the LTS line and the
likely production pin. Runner images were built from the same 14MB `build/` output with an
identical stage structure, npm stripped from the Node image since the runner needs no package
manager.

| Option                          | Builds | Runner image | Runtime binary |
| ------------------------------- | ------ | ------------ | -------------- |
| Bun everywhere                  | yes    | 165MB        | 84.5MB         |
| Node + aube everywhere          | yes    | 252MB        | 124.7MB        |
| Deno everywhere                 | **no** | 180MB        | 91.2MB         |
| Node + aube build, Deno runtime | yes    | 180MB        | 91.2MB         |

**Deno everywhere was rejected because it does not build.** `sveltekit-superforms` declares 14
peer dependencies, 12 of them optional, one adapter per validation library. Uppity uses
valibot. Node and aube treat the other 11 as absent and optional; Deno attempts to resolve
them all and the build fails. Installing `effect` to clear the first failure only advances the
error to `typebox`, so the workaround would be installing eleven validation libraries the
project does not use.

The failure is masked in normal output: SvelteKit's `fork.js` reports only `Failed with code 1`
and swallows the worker's stderr. The real message appears only in the raw build log.

**Node everywhere was rejected on image size.** At 252MB it gives back 87MB, more than half the
ground won in the 1.11GB to 165MB reduction. The cost is structural rather than packaging: the
Node 24 binary alone is 124.7MB against Deno's 91.2MB, and npm accounts for only 16.9MB of the
difference. The figure is the favourable one for Node. The current line is larger still, at a
141.2MB binary on a 249MB base, so tracking Node forward widens the gap rather than closing
it.

**Bun was rejected on stewardship**, per the context above, not on measured defect. Its 165MB
image remains the smallest of the four.

Two risks that were predicted and did not materialise are worth recording so they are not
re-litigated. Paraglide's `@lix-js/sdk` native N-API addon, which is glibc-only and already
forced this repo onto two Docker bases, compiles cleanly under Deno. And the SvelteKit Deno
adapter is first-party (`denoland/svelte-adapter`), so it carries the same maintenance standing
as `adapter-node`.

## Consequences

The 165MB image grows to roughly 180MB. This is the price of leaving Bun and it is accepted.

Deno's permission flags become available on the runner. The benefit is per-process rather than
global: `worker-monitor` connects to arbitrary user-supplied hosts by design, so its
`--allow-net` must stay broad. The web tier is internet-facing and is the one worth scoping
tightly. Whether it can be scoped to Postgres alone depends on whether Polar and nodemailer
calls originate there or only in `worker-notifier`, which must be confirmed during
implementation.

Two runtimes appear in the repo, but the day-to-day surface is one. Every developer-facing
command (`dev`, `check`, `lint`, `test:unit`, `test:e2e`, `db:*`) runs on Node with aube.
Deno appears in the runner stage's `FROM` line and in whatever smoke-tests the built artifact.
Contributors run `mise install` and never invoke Deno directly. The Dockerfile already carried
two bases for the paraglide reason, so this changes which base the runner uses rather than
introducing multi-base builds.

Work this decision implies, none of it yet done:

1. Swap the package manager to aube on `pnpm-lock.yaml`, independently of everything else.
2. Replace `Bun.connect` in the TCP wrapper with `node:net`.
3. Replace `Bun.Transpiler`, `Bun.Glob`, and `Bun.file` in the externals check. The pure policy
   functions and their tests are unaffected by design.
4. Rebuild the three worker and migrate bundles with rolldown, already present via Vite 8.
5. Swap the SvelteKit adapter to the Deno adapter and the runner base to `denoland/deno`.
6. Update the Dockerfile healthcheck, `CMD`, and the Railway pre-deploy command.
7. Update CI to install Node and aube, and replace `bun audit`.
8. Delete `bunfig.toml`, drop `@types/bun`, and change the `engines` constraint.
9. Scope `--allow-*` per process, web tier first.
10. Update `CLAUDE.md`, `README.md`, and `CONTRIBUTING.md`, which currently instruct
    contributors to use Bun APIs and `bun run` commands.

## Revisit when

Deno-only becomes viable if Deno's optional peer dependency resolution is fixed, or if
`sveltekit-superforms` restructures its adapters. Either would let the Node half be dropped
for a single-runtime setup at 180MB. Re-run the build under Deno before assuming this ADR
still holds.
