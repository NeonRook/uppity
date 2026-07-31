import { Polar } from "@polar-sh/sdk";

// $env/dynamic/private gets baked in at build time by svelte-adapter-bun
const { POLAR_ACCESS_TOKEN, POLAR_SERVER } = process.env;

/**
 * Which Polar environment to talk to.
 *
 * Sandbox and production are entirely separate systems with their own access
 * tokens, product IDs and webhook secrets. This is an explicit setting rather
 * than a guess from the build mode, because both unusual directions are real:
 * a dev server may need to reproduce a production billing bug, and a staging
 * build may need to stay on sandbox.
 *
 * Defaults to production so a deployment that never sets it keeps working.
 */
export const polarServer: "sandbox" | "production" =
	POLAR_SERVER === "sandbox" ? "sandbox" : "production";

/**
 * Shared Polar API client.
 *
 * Constructing this is lazy - no request is made until a method is called - so
 * a single module-level instance is safe even in self-hosted mode where
 * POLAR_ACCESS_TOKEN is unset and no Polar call ever happens.
 */
export const polarClient = new Polar({
	accessToken: POLAR_ACCESS_TOKEN,
	server: polarServer,
});
