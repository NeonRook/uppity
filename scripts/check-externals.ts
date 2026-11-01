#!/usr/bin/env node
/**
 * Fails the build if the built output contains a bare import that the runtime
 * image will not be able to resolve.
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

/** The image installs `dependencies` only, so a bare import of anything else fails at runtime. */
const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
	dependencies: Record<string, string>;
};
const RUNTIME_EXTERNALS: readonly string[] = Object.keys(pkg.dependencies);

const SCAN_TARGETS: ReadonlyArray<readonly [string, string]> = [
	["build", "*.js"],
	["build/server", "**/*.js"],
	["build/chunks", "*.js"],
];

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

export interface ScannedImport {
	specifier: string;
	dynamic: boolean;
}

/**
 * Every import, re-export and dynamic import in `source`.
 *
 * Uses a lexer rather than a regex: the bundle contains SQL string literals with
 * the word `from` in them, which defeats pattern matching. A dynamic import over
 * a computed expression has no literal specifier and is skipped, because there is
 * no package name to check and no parser could supply one.
 */
export async function scanSpecifiers(source: string): Promise<ScannedImport[]> {
	await init();
	const [imports] = parse(source);
	return imports.flatMap((record) =>
		typeof record.specifier === "string" && !(record.type === "dynamic" && record.glob)
			? [{ specifier: record.specifier, dynamic: record.type === "dynamic" }]
			: [],
	);
}

export async function findOffences(
	root: string,
	allowed: readonly string[],
	pattern = "**/*.js",
	optional: readonly string[] = [],
): Promise<Map<string, string[]>> {
	const offences = new Map<string, string[]>();

	for await (const file of glob(pattern, { cwd: root })) {
		const path = `${root}/${file}`;
		const required = (await scanSpecifiers(await readFile(path, "utf8")))
			.filter(({ specifier, dynamic }) => !(dynamic && optional.includes(packageNameOf(specifier))))
			.map(({ specifier }) => specifier);
		const found = disallowedFrom(required, allowed);
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
	const [, , override] = process.argv;
	const targets = override ? [[override, "**/*.js"] as const] : SCAN_TARGETS;

	const offences = new Map<string, string[]>();
	for (const [root, pattern] of targets) {
		for (const entry of await findOffences(root, RUNTIME_EXTERNALS, pattern)) {
			offences.set(entry[0], entry[1]);
		}
	}

	if (offences.size > 0) {
		console.error("the build imports packages the runtime image will not contain:\n");
		for (const [path, specifiers] of offences) {
			console.error(`  ${path}`);
			for (const specifier of specifiers) console.error(`    ${specifier}`);
		}
		console.error(
			"\nMove them to `dependencies` in package.json, which is what the image installs.",
		);
		process.exit(1);
	}

	console.log(
		`${targets.length} build targets resolve cleanly against ${RUNTIME_EXTERNALS.length} allowlisted specifiers`,
	);
}
