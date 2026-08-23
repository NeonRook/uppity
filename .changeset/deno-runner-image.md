---
"uppity": minor
---

The container now runs on Deno instead of Bun. Two things to do when you upgrade.

If you override the container command to run the monitor or notifier workers, or you run migrations as a separate pre-deploy step, update those commands: `bun run ./build/worker-monitor.js` becomes `deno run -A ./build/worker-monitor.js`, and the same shape applies to the notifier and the migration step. The bundled web server is now started with `deno run -A ./build/serve.js`. The published `docker-compose.yml` and the Railway configs are already updated.

If a reverse proxy terminates TLS in front of Uppity, set `ORIGIN` to the public URL your users visit, for example `https://status.example.com`. The old runtime guessed this; the new one does not, and without it links and form submissions are built against the container's internal address and will fail. Nothing to do if Uppity is reachable directly.

The image grows from 165MB to 179MB, which is the cost of the move and was expected.
