---
"uppity": patch
---

Fix the container image build, which had been failing since `@inlang/paraglide-js` moved to 2.24.0.
That release pulls in `@inlang/sdk` 3, which replaced the WASM SQLite in `@lix-js/sdk` with a native
addon whose prebuilt binaries are glibc-only, so message compilation could not run under Alpine. The
build stages now use the Debian-based `oven/bun:1`; the runtime image is unchanged, still Alpine and
still 165MB, because it only ever copies `build/` and `drizzle/` out of the builder.
