---
"uppity": patch
---

Shrink the runtime Docker image from 726MB to 169MB. The SSR graph is now fully bundled instead of externalised, so the image ships no dependency tree beyond `@opentelemetry/api` — the one package that must resolve at run time. The base image moved to `oven/bun:1-alpine`, server sourcemaps are no longer shipped, and a new build-time check (`check:externals`) fails the build if the server bundle imports anything the image will not contain.
