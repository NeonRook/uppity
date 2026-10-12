import { defineConfig } from "@playwright/test";

import { AUTH_SECRET, BASE_URL, E2E_DATABASE_URL, PORT } from "./e2e/env";

export default defineConfig({
	testDir: "e2e",
	globalSetup: "./e2e/global-setup.ts",
	use: { baseURL: BASE_URL },
	webServer: {
		command: "pnpm build && pnpm preview",
		port: PORT,
		env: {
			DATABASE_URL: E2E_DATABASE_URL,
			// better-auth only answers requests whose origin matches its own URL.
			BETTER_AUTH_URL: BASE_URL,
			BETTER_AUTH_TRUSTED_ORIGINS: BASE_URL,
			BETTER_AUTH_SECRET: AUTH_SECRET,
			// Tests send their own address here, so each signs up in its own rate-limit bucket.
			CLIENT_IP_HEADER: "x-real-ip",
			// Keeps a local run from calling the Polar account in `.env`.
			POLAR_ACCESS_TOKEN: "",
		},
	},
});
