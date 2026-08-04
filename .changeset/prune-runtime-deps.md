---
"uppity": patch
---

Shrink the container image from 1.11 GB to 726 MB. The runtime image was
installing optional peer dependencies of production packages — including
`vitest`, `drizzle-kit` and `esbuild` — which added roughly 275 MB and 35
vulnerable esbuild binaries that nothing at runtime used. Database migrations
now run through `drizzle-orm`'s migrator rather than `drizzle-kit`.
