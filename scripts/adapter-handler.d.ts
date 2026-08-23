// The adapter's generated `.deno-deploy/handler.ts`, reached through the
// `adapter-handler` alias so the type checker stops here instead of following
// into it. That file imports the SvelteKit server bundle, which ships no
// declarations, and checking through it reports errors in generated code that
// cannot be fixed — which previously cost this project `noImplicitAny`.
//
// The bundler resolves the real module, so a wrong signature here fails the
// build rather than the container.
declare module "adapter-handler" {
	export function prepareServer(
		rawSvelteData: { isr?: unknown[] },
		rawDeployConfig: unknown,
		cwd: string,
	): Deno.ServeHandler;
}
