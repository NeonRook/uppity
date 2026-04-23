import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import devtoolsJson from "vite-plugin-devtools-json";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		devtoolsJson(),
		paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/lib/paraglide" }),
	],

	// better-auth dynamic-imports @opentelemetry/api and reads named exports (`mod.trace`).
	// Vite's CJS→ESM interop returns `{ default: exports }`, so the import must stay
	// external — Bun resolves it at runtime with correct named-export extraction.
	ssr: { external: ["@opentelemetry/api"] },

	test: {
		expect: { requireAssertions: true },

		projects: [
			{
				extends: "./vite.config.ts",

				test: {
					name: "client",

					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: "chromium", headless: true }],
					},

					include: ["src/**/*.svelte.{test,spec}.{js,ts}"],
					exclude: ["src/lib/server/**"],
				},
			},

			{
				extends: "./vite.config.ts",

				test: {
					name: "server",
					environment: "node",
					include: ["src/**/*.{test,spec}.{js,ts}"],
					exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
					globalSetup: ["./src/lib/server/test/global-setup.ts"],
				},
			},
		],
	},
});
