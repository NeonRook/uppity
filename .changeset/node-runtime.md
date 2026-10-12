---
"uppity": minor
---

Self-hosted: the image now runs on Node instead of Deno. The image keeps its name and its commands, and needs no new environment variables.

- `ORIGIN` works as before, including plain `http://` addresses. The server no longer falls back to the origin of `BETTER_AUTH_URL` when `ORIGIN` is unset: it assumes https and the request's `Host` header. If you serve plain HTTP and never set `ORIGIN`, set it now. Behind a proxy that rewrites `Host`, you can set `HOST_HEADER=x-forwarded-host` instead of `ORIGIN`.
- The web server and migrations still cannot write files, start other programs or load native code. They can now connect to any network address, where before only the database, mail servers and billing API were allowed.
- The image is about 57MB larger on disk and 8MB larger to download.
- One "ExperimentalWarning" line about `--allow-net` appears in the web server's log at startup. It is expected.
