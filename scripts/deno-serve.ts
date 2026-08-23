/**
 * Web tier entry point for the Deno runner.
 *
 * The Deno adapter emits its own `.deno-deploy/server.ts`, which this replaces
 * for two reasons.
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
 * The SvelteKit server under `.deno-deploy/server/` stays external: it is
 * already bundled, and re-bundling it would only risk breaking it.
 */
import rawDeployConfig from "../.deno-deploy/deploy.json" with { type: "json" };
import { prepareServer } from "../.deno-deploy/handler.ts";
import rawSvelteData from "../.deno-deploy/svelte.json" with { type: "json" };

declare const Deno: {
	cwd(): string;
	env: { get(key: string): string | undefined };
	serve(options: { port: number; hostname: string }, handler: unknown): unknown;
};

const port = Number(Deno.env.get("PORT") ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error(`PORT must be an integer between 1 and 65535, received: ${Deno.env.get("PORT")}`);
}

// Containers reach the app from outside their own network namespace, so the
// loopback default would make it unreachable.
const hostname = Deno.env.get("HOST") ?? "0.0.0.0";

// Relative paths in deploy.json resolve against this, so the process must be
// started from the directory holding .deno-deploy/.
const handler = prepareServer(rawSvelteData, rawDeployConfig, Deno.cwd());

Deno.serve({ port, hostname }, handler);
