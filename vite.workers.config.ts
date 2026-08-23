import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

const ADAPTER_OUT = ".deno-deploy";

/**
 * Keeps the SvelteKit server out of the bundle and points the import at where
 * the runner image actually puts it.
 *
 * The adapter's handler reaches its server as `./server/index.js`, correct from
 * `.deno-deploy/`. The bundle lands in `build/` instead, so the specifier has to
 * cross back over. Rollup emits an external's specifier verbatim, so rewriting
 * it needs a resolver rather than an `external` entry.
 */
function externalAdapterServer(): Plugin {
	return {
		name: "external-adapter-server",
		enforce: "pre",
		resolveId(source, importer) {
			if (!importer?.includes(ADAPTER_OUT) || !source.startsWith("./server/")) return null;
			return { id: `../${ADAPTER_OUT}/${source.slice(2)}`, external: true };
		},
	};
}

export default defineConfig({
	plugins: [externalAdapterServer()],

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
				serve: "scripts/deno-serve.ts",
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
