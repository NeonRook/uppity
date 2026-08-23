/**
 * Web tier entry point for the Deno runner.
 *
 * The Deno adapter emits its own `.deno-deploy/server.ts`, which this replaces.
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
 */

import { prepareServer } from "adapter-handler";

import rawDeployConfig from "../.deno-deploy/deploy.json" with { type: "json" };
import rawSvelteData from "../.deno-deploy/svelte.json" with { type: "json" };

function publicOrigin(): string | undefined {
	const explicit = Deno.env.get("ORIGIN");
	if (explicit) return explicit;

	const authUrl = Deno.env.get("BETTER_AUTH_URL");
	if (!authUrl) return undefined;

	try {
		return new URL(authUrl).origin;
	} catch {
		throw new Error(`BETTER_AUTH_URL must be a valid URL, received: ${authUrl}`);
	}
}

/**
 * `prepareServer` reads ORIGIN from the environment once, at construction, and
 * accepts no argument for it. Setting it inside the same call is what stops the
 * two being reordered into a server that ignores the value.
 */
function createHandler(): Deno.ServeHandler {
	const origin = publicOrigin();
	if (origin) Deno.env.set("ORIGIN", origin);

	return prepareServer(rawSvelteData, rawDeployConfig, Deno.cwd());
}

const port = Number(Deno.env.get("PORT") ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error(`PORT must be an integer between 1 and 65535, received: ${Deno.env.get("PORT")}`);
}

const hostname = Deno.env.get("HOST") ?? "0.0.0.0";

Deno.serve({ port, hostname }, createHandler());
