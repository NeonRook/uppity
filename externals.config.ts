/**
 * Specifiers the SSR bundle is permitted to leave unresolved.
 *
 * `ssr.noExternal` bundles everything else, so the runtime image ships no
 * node_modules beyond RUNTIME_EXTERNALS. Adding to it is a deliberate act:
 * scripts/check-externals.ts fails the build on anything not listed here.
 *
 * See docs/superpowers/specs/2026-08-04-runtime-image-size-design.md
 */

/**
 * Cannot be bundled and IS executed, so these must be COPYed into the runtime
 * image. Every entry needs a comment explaining why bundling fails.
 */
export const RUNTIME_EXTERNALS = [
	// better-auth dynamic-imports this and reads named exports (`mod.trace`).
	// Vite's CJS-to-ESM interop returns `{ default: exports }`, so bundling
	// breaks the named-export extraction. Bun resolves it correctly at run time.
	"@opentelemetry/api",
] as const;

export const SSR_EXTERNALS: readonly string[] = [...RUNTIME_EXTERNALS];
