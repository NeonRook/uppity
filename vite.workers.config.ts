import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
	// $lib is declared in the generated .svelte-kit tsconfig, which only the app
	// build reads. These entry points avoid the alias but reach modules under
	// src/lib that use it.
	resolve: { alias: { $lib: fileURLToPath(new URL("src/lib", import.meta.url)) } },

	// The runner image ships no node_modules, so nothing may be left external.
	ssr: { noExternal: true },

	build: {
		ssr: true,
		sourcemap: false,
		outDir: "build",
		// The SvelteKit build populates build/ first and this run adds to it.
		emptyOutDir: false,
		rolldownOptions: {
			input: {
				"worker-monitor": "src/worker/monitor/index.ts",
				"worker-notifier": "src/worker/notifier/index.ts",
				migrate: "scripts/migrate.ts",
			},
			output: {
				format: "esm",
				entryFileNames: "[name].js",
				chunkFileNames: "chunks/[name].js",
			},
		},
	},
});
