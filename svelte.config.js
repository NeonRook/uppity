import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import adapter from "svelte-adapter-bun";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		experimental: {
			remoteFunctions: true,
		},
		typescript: {
			config: (cfg) => {
				cfg.compilerOptions.types.push("bun");
			},
		},
	},

	compilerOptions: {
		experimental: {
			async: true,
		},
	},
};

export default config;
