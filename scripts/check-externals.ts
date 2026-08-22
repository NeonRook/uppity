#!/usr/bin/env node
/**
 * Fails the build if build/server contains a bare import that the runtime image
 * will not be able to resolve.
 *
 * Without this, a dependency bump that introduces something Vite cannot bundle
 * leaves an externalised specifier pointing at a package the image no longer
 * contains. That does not fail in CI — it fails at request time in production.
 * This converts that runtime 500 into a build error.
 */
import { glob, readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { pathToFileURL } from "node:url";

import { init, parse } from "es-module-lexer";

/**
 * Specifiers build/server may leave unresolved.
 *
 * Empty, and worth keeping that way — an empty allowlist is what lets the runtime
 * image ship no node_modules at all. Adding an entry is a three-place change:
 * here, `ssr.external` in vite.config.ts, and a COPY into the Dockerfile's runner
 * stage. Miss the third and it fails at request time in production, not in CI.
 */
const RUNTIME_EXTERNALS: readonly string[] = [];

const DEFAULT_ROOT = "build/server";

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
 * Every import, re-export and dynamic import in `source`.
 *
 * Uses a lexer rather than a regex: the bundle contains SQL string literals with
 * the word `from` in them, which defeats pattern matching. A dynamic import over
 * a computed expression has no literal specifier and is skipped, because there is
 * no package name to check and no parser could supply one.
 */
export async function scanSpecifiers(source: string): Promise<string[]> {
	await init;
	const [imports] = parse(source);
	return imports.map((record) => record.n).filter((name) => name !== undefined);
}

/** Maps each file under `root` that imports something disallowed to those specifiers. */
export async function findOffences(
	root: string,
	allowed: readonly string[],
): Promise<Map<string, string[]>> {
	const offences = new Map<string, string[]>();

	for await (const file of glob("**/*.js", { cwd: root })) {
		const path = `${root}/${file}`;
		const found = disallowedFrom(await scanSpecifiers(await readFile(path, "utf8")), allowed);
		if (found.length > 0) offences.set(path, found);
	}

	return offences;
}

/**
 * True only when this file is the process entry point.
 *
 * Getting this wrong skips the main block silently: the check then reports
 * success while scanning nothing.
 */
function invokedDirectly(): boolean {
	const [, entry] = process.argv;
	return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
	// The root is an argument so the failure path can be exercised against a
	// fixture directory; the build always uses the default.
	const root = process.argv[2] ?? DEFAULT_ROOT;
	const offences = await findOffences(root, RUNTIME_EXTERNALS);

	if (offences.size > 0) {
		console.error(`${root} imports packages the runtime image will not contain:\n`);
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
		`${root} resolves cleanly against ${RUNTIME_EXTERNALS.length} allowlisted specifiers`,
	);
}
