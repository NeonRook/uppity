#!/usr/bin/env bun
/**
 * Fails the build if build/server contains a bare import that the runtime image
 * will not be able to resolve.
 *
 * Without this, a dependency bump that introduces something Vite cannot bundle
 * leaves an externalised specifier pointing at a package the image no longer
 * contains. That does not fail in CI — it fails at request time in production.
 * This converts that runtime 500 into a build error.
 *
 * The policy functions below are pure and unit-tested. Parsing is delegated to
 * Bun's transpiler and kept out of them, because the Vitest server project runs
 * under Node where the `Bun` global does not exist.
 */
import { isBuiltin } from "node:module";

/**
 * Specifiers build/server may leave unresolved.
 *
 * Empty, and worth keeping that way — an empty allowlist is what lets the runtime
 * image ship no node_modules at all. Adding an entry is a three-place change:
 * here, `ssr.external` in vite.config.ts, and a COPY into the Dockerfile's runner
 * stage. Miss the third and it fails at request time in production, not in CI.
 */
const RUNTIME_EXTERNALS: readonly string[] = [];

/** `@scope/name/deep` becomes `@scope/name`; `name/deep` becomes `name`. */
export function packageNameOf(specifier: string): string {
	const parts = specifier.split("/");
	return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Specifiers that are neither relative nor absolute, nor Node built-ins, nor allowlisted. */
export function disallowedFrom(specifiers: Iterable<string>, allowed: readonly string[]): string[] {
	const offences = new Set<string>();

	for (const specifier of specifiers) {
		if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
		if (isBuiltin(specifier)) continue;
		if (allowed.includes(packageNameOf(specifier))) continue;
		offences.add(specifier);
	}

	return [...offences].toSorted();
}

/**
 * Every import, dynamic import and require in `source`.
 *
 * Uses Bun's transpiler rather than a regex: the bundle contains SQL string
 * literals with the word `from` in them, which defeats pattern matching.
 */
export function scanSpecifiers(source: string): string[] {
	return new Bun.Transpiler({ loader: "js" }).scanImports(source).map((record) => record.path);
}

if (import.meta.main) {
	const offences = new Map<string, string[]>();

	for await (const file of new Bun.Glob("**/*.js").scan({ cwd: "build/server" })) {
		const path = `build/server/${file}`;
		const found = disallowedFrom(scanSpecifiers(await Bun.file(path).text()), RUNTIME_EXTERNALS);
		if (found.length > 0) offences.set(path, found);
	}

	if (offences.size > 0) {
		console.error("build/server imports packages the runtime image will not contain:\n");
		for (const [path, specifiers] of offences) {
			console.error(`  ${path}`);
			for (const specifier of specifiers) console.error(`    ${specifier}`);
		}
		console.error(
			"\nEither let Vite bundle them, or add them to RUNTIME_EXTERNALS above and to" +
				"\n`ssr.external` in vite.config.ts — and COPY them into the Dockerfile's runner stage.",
		);
		process.exit(1);
	}

	console.log(
		`build/server resolves cleanly against ${RUNTIME_EXTERNALS.length} allowlisted specifiers`,
	);
}
