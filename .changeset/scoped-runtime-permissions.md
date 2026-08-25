---
"uppity": minor
---

Container processes now start with only the access they need, instead of full access to the machine. The web server can reach your database, your mail server and the billing API, and nothing else on the network. It cannot write files, start subprocesses or load native code. Both workers keep unrestricted outbound network access, because checking monitors and delivering webhooks means connecting to whatever address you configure, but they give up everything else.

The point of this is the web tier. Uppity's job is fetching addresses your users supply, so a flaw that tricks the server into fetching an address it should not is the failure worth guarding against. A request like that now fails at the runtime, before it reaches the network.

Nothing new to configure. The list of permitted hosts is assembled when the container starts, from `DATABASE_URL`, `SMTP_HOST` and `SMTP_PORT`. If you later point Uppity at a service it did not previously contact, the connection is refused and the log names the host that was wanted.

If you override the container command, to run one of the workers or to run migrations as a separate pre-deploy step, update it: `deno run -A ./build/worker-monitor.js` becomes `./entrypoint.sh worker-monitor`, and the same shape applies to the notifier (`worker-notifier`), the migration step (`migrate`) and the web server (`serve`). The published `docker-compose.yml` is already updated. Commands that invoke the bundles directly still work, but they run without any of the restrictions above.
