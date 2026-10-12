---
"uppity": minor
---

Self-hosted: the image now runs on Node instead of Deno. The image keeps its name and its commands, and needs no new environment variables.

- `ORIGIN` is no longer read. The server takes every request as https on the host in its `Host` header. If your reverse proxy rewrites `Host`, set `HOST_HEADER=x-forwarded-host` instead. Serving plain HTTP with no TLS proxy in front is no longer supported: forms are rejected as cross-site.
- The web server and migrations still cannot write files, start other programs or load native code. They can now connect to any network address, where before only the database, mail servers and billing API were allowed.
- The image is about 57MB larger on disk and 8MB larger to download.
- One "ExperimentalWarning" line about `--allow-net` appears in the web server's log at startup. It is expected.
