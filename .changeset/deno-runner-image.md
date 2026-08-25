---
"uppity": minor
---

The container now runs on Deno instead of Bun.

If you run Uppity behind a reverse proxy that terminates TLS, check that `BETTER_AUTH_URL` is set to the public URL your users visit before upgrading. The previous runtime assumed HTTPS on its own; the new one takes the public URL from `BETTER_AUTH_URL`, or from `ORIGIN` if you prefer to set it separately. With neither, the server believes it is reachable at its internal address, and every form submission — including login — is rejected as cross-site. Nothing to do if Uppity is reachable directly, or if you already set `BETTER_AUTH_URL`, which the published `docker-compose.yml` does.

If you override the container command to run the monitor or notifier workers, or you run migrations as a separate pre-deploy step, update those commands: `bun run ./build/worker-monitor.js` becomes `./entrypoint.sh worker-monitor`, and the same shape applies to the notifier and the migration step. The bundled web server is now started with `./entrypoint.sh serve`. The published `docker-compose.yml` and the Railway configs are already updated.

The image grows from 165MB to 179MB, which is the cost of the move and was expected.
