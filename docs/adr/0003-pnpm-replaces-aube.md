---
status: accepted
date: 2026-10-06
---

# pnpm replaces aube as the package manager

Uppity installs and runs scripts with pnpm. This replaces the package-manager half of
[ADR 0001](0001-node-aube-build-deno-runtime.md). The rest of that decision stands: build on
Node, run on Deno.

## Context

aube cost more operational work than any other part of the toolchain:

- Its build jail needs Landlock. Railway and Blacksmith builder kernels lack it, so jailed
  installs failed with EINVAL until `AUBE_JAIL_BUILDS=false` turned the jail off.
- aube 2.x's jail broke esbuild's postinstall, and store directories left by aube 1.x crashed
  installs.
- The Dockerfile needed `AUBE_ENABLE_GLOBAL_VIRTUAL_STORE=false` before the installed tree
  survived a stage copy.
- It gave out-of-range peers a separate resolution. `@sveltejs/kit` ended up with no
  TypeScript, so `svelte-kit sync` wrote no `.svelte-kit/tsconfig.json`, and `check` passed
  while it hid two type errors.

ADR 0001 kept pnpm as the fallback, but the lockfile did not stay in `pnpm-lock.yaml` format.
pnpm cannot parse `aube-lock.yaml`, so this change resolved the lockfile from scratch.

## Decision

pnpm, pinned through `mise.toml` and enforced through `devEngines`. Settings live in
`pnpm-workspace.yaml`, the only place pnpm 11 and later read them from. pnpm's default
one-day `minimumReleaseAge` stays on.

Root `typescript` is pinned to 6. TypeScript 7 has no JavaScript API, and kit, svelte-check,
and typescript-eslint all declare a peer range that excludes it.

## Revisit when

TypeScript 7 falls inside the peer ranges of kit, svelte-check and typescript-eslint. Or
pnpm does to this repository what aube did.
