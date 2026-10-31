import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

import pkg from "./package.json" with { type: "json" };

/**
 * Leaves the SvelteKit build's handler to load at runtime rather than bundling
 * it a second time. Rolldown rewrites a relative `external` entry against the
 * project root, so the specifier is set here as it resolves from build/serve.js.
 */
function externalHandler(): Plugin {
	return {
		name: "external-handler",
		enforce: "pre",
		resolveId: (source) =>
			source === "../build/handler.js" ? { id: "./handler.js", external: true } : null,
	};
}

export default defineConfig({
	// The runner image has no package.json to read the version from.
	define: { "import.meta.env.APP_VERSION": JSON.stringify(pkg.version) },

	plugins: [externalHandler()],

	// $lib is declared in the generated .svelte-kit tsconfig, which only the app
	// build reads. These entry points avoid the alias but reach modules under
	// src/lib that use it.
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL("src/lib", import.meta.url)),
		},
	},

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
				serve: "scripts/serve.ts",
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
