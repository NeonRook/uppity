import { paraglideVitePlugin } from "@inlang/paraglide-js";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import devtoolsJson from "vite-plugin-devtools-json";
import { defineConfig } from "vitest/config";

import pkg from "./package.json" with { type: "json" };

export default defineConfig({
	// The runner image has no package.json to read the version from.
	define: { "import.meta.env.APP_VERSION": JSON.stringify(pkg.version) },

	plugins: [
		tailwindcss(),
		sveltekit({
			tracing: { server: true },
			preprocess: vitePreprocess(),
			compilerOptions: { experimental: { async: true } },
			adapter: adapter(),
			experimental: { remoteFunctions: true },
		}),
		devtoolsJson(),
		paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/lib/paraglide" }),
	],

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
});
