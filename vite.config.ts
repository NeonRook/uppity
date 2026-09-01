import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import devtoolsJson from "vite-plugin-devtools-json";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		sveltekit(),
		devtoolsJson(),
		paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/lib/paraglide" }),
	],

	// Bundle the SSR graph instead of externalising it: externalised imports were what
	// forced the whole 357MB production tree into the runtime image. Nothing is exempt,
	// so the image ships no node_modules at all, and scripts/check-externals.ts fails
	// the build if build/server is left importing any package, Node built-ins aside.
	//
	// Build only. The dev server runs on Node, which loads CommonJS packages such
	// as pino and nodemailer natively; inlined, they reach Vite's ESM module runner
	// and fail on their first `require`.
	ssr: { noExternal: command === "build" ? true : undefined },

	// Server sourcemaps were 9.2MB of a 15MB build/server and grow under bundling.
	// Diagnosis relies on the structured pino logs instead. The client build already
	// emits none, so this changes only the server.
	build: { sourcemap: false },

	server: {
		allowedHosts: process.env.VITE_ALLOWED_HOSTS?.split(",") ?? [],
	},

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
					// scripts/ holds build tooling with real logic (check-externals);
					// its specs run in the server project, which is the Node environment.
					include: ["src/**/*.{test,spec}.{js,ts}", "scripts/**/*.{test,spec}.{js,ts}"],
					exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
					globalSetup: ["./src/lib/server/test/global-setup.ts"],
				},
			},
		],
	},
}));
