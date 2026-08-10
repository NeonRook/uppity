---
"uppity": patch
---

Shrink the runtime Docker image from 169MB to 165MB (46.2MB to 43.8MB pulled) and drop `node_modules` from it entirely. `auth.ts` now builds from `better-auth/minimal`, which removes Kysely and its unused sqlite/mysql/mssql dialects from the server bundle, and `@opentelemetry/api` is bundled rather than externalised — Vite resolves its ESM build, so better-auth's dynamic import still gets genuine named exports. With nothing left to exempt, the runtime allowlist is empty and the image ships only `build/`, `drizzle/` and a minimal manifest.
