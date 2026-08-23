/**
 * Web tier entry point for the Deno runner.
 *
 * The Deno adapter emits its own `.deno-deploy/server.ts`, which this replaces
 * for three reasons.
 *
 * It calls `Deno.serve(handler)` with no options, which binds port 8000 and
 * ignores `PORT`. Railway injects `PORT` and routes to it, so the adapter's
 * entry would come up on a port nothing reaches.
 *
 * And its `handler.ts` imports `@deno/svelte-adapter/__internal`, a bare
 * specifier that reaches `@deno/experimental-route-config` and
 * `urlpattern-polyfill`. Resolving that at runtime would put a `node_modules`
 * back in the runner image, which is the thing `scripts/check-externals.ts`
 * exists to prevent. Going through the bundler inlines it instead.
 *
 * And it offers no way to set ORIGIN, which a proxied deployment cannot run
 * without. See `deriveOrigin` below.
 *
 * The SvelteKit server under `.deno-deploy/server/` stays external: it is
 * already bundled, and re-bundling it would only risk breaking it.
 *
 * This is the only file in the project that may use `Deno.*`. Its types come
 * from `@types/deno` via `scripts/tsconfig.deno.json`, which the build runs
 * after the adapter has emitted the files imported below. That config is
 * separate from the root one so `Deno` resolves here and nowhere else —
 * application code runs on Node in dev and under test, so a stray `Deno.` in
 * `src/` should fail to compile rather than work only in production.
 */
import rawDeployConfig from "../.deno-deploy/deploy.json" with { type: "json" };
import { prepareServer } from "../.deno-deploy/handler.ts";
import rawSvelteData from "../.deno-deploy/svelte.json" with { type: "json" };

/**
 * Derives ORIGIN from BETTER_AUTH_URL when it is not set explicitly.
 *
 * Behind a proxy that terminates TLS, the server receives a plain HTTP request
 * on its own port and has no way to learn the public URL. SvelteKit then
 * compares the browser's Origin header against that internal address, they
 * disagree, and every form submission is rejected as cross-site — including
 * login, so the instance locks everyone out with a 403.
 *
 * BETTER_AUTH_URL already means "the public URL of the application", which is
 * exactly what ORIGIN needs, and a proxied deployment has to set it anyway. So
 * the common case needs no second variable. An explicit ORIGIN always wins.
 *
 * A malformed BETTER_AUTH_URL leaves ORIGIN unset rather than throwing: it is
 * the wrong variable to fail startup on, and the adapter validates ORIGIN
 * itself when it is set deliberately.
 *
 * Must run before prepareServer, which reads ORIGIN once at construction.
 */
function deriveOrigin(): void {
	if (Deno.env.get("ORIGIN")) return;

	const authUrl = Deno.env.get("BETTER_AUTH_URL");
	if (!authUrl) return;

	try {
		Deno.env.set("ORIGIN", new URL(authUrl).origin);
	} catch {
		// Not a URL. Leave ORIGIN unset and let the request URL stand.
	}
}

const port = Number(Deno.env.get("PORT") ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error(`PORT must be an integer between 1 and 65535, received: ${Deno.env.get("PORT")}`);
}

// Containers reach the app from outside their own network namespace, so the
// loopback default would make it unreachable.
const hostname = Deno.env.get("HOST") ?? "0.0.0.0";

deriveOrigin();

// Relative paths in deploy.json resolve against this, so the process must be
// started from the directory holding .deno-deploy/.
const handler = prepareServer(rawSvelteData, rawDeployConfig, Deno.cwd());

Deno.serve({ port, hostname }, handler);
