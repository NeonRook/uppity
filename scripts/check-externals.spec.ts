import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterAll, describe, expect, it } from "vitest";

import { disallowedFrom, findOffences, packageNameOf, scanSpecifiers } from "./check-externals";

const run = promisify(execFile);
const roots: string[] = [];

async function buildTree(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "check-externals-"));
	roots.push(root);
	for (const [name, source] of Object.entries(files)) {
		const path = join(root, name);
		await mkdir(join(path, ".."), { recursive: true });
		await writeFile(path, source);
	}
	return root;
}

afterAll(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("packageNameOf", () => {
	it("keeps both segments of a scoped package", () => {
		expect(packageNameOf("@opentelemetry/api")).toBe("@opentelemetry/api");
	});

	it("strips a deep path from a scoped package", () => {
		expect(packageNameOf("@polar-sh/better-auth/client")).toBe("@polar-sh/better-auth");
	});

	it("strips a deep path from an unscoped package", () => {
		expect(packageNameOf("drizzle-orm/postgres-js/migrator")).toBe("drizzle-orm");
	});
});

describe("disallowedFrom", () => {
	it("reports a bare specifier that is not allowlisted", () => {
		expect(disallowedFrom(["drizzle-orm"], [])).toEqual(["drizzle-orm"]);
	});

	it("accepts a specifier whose package is allowlisted", () => {
		expect(disallowedFrom(["@opentelemetry/api"], ["@opentelemetry/api"])).toEqual([]);
	});

	it("accepts a deep import into an allowlisted package", () => {
		expect(disallowedFrom(["@opentelemetry/api/build/esm/trace"], ["@opentelemetry/api"])).toEqual(
			[],
		);
	});

	it("ignores relative and absolute specifiers, which resolve inside build/", () => {
		expect(disallowedFrom(["./chunks/0-abc.js", "../env.js", "/opt/thing.js"], [])).toEqual([]);
	});

	it("ignores node built-ins with and without the node: prefix", () => {
		expect(disallowedFrom(["node:fs", "path", "async_hooks"], [])).toEqual([]);
	});

	it("deduplicates a specifier seen more than once", () => {
		expect(disallowedFrom(["pg", "pg"], [])).toEqual(["pg"]);
	});

	it("sorts its output so build failures are stable to read", () => {
		expect(disallowedFrom(["zod", "drizzle-orm", "pino"], [])).toEqual([
			"drizzle-orm",
			"pino",
			"zod",
		]);
	});
});

describe("scanSpecifiers", () => {
	it("finds static, dynamic and re-exported specifiers", async () => {
		const found = await scanSpecifiers(
			'import a from "pg";await import("pino");export * from "@scope/thing";',
		);

		expect(found).toEqual(["pg", "pino", "@scope/thing"]);
	});

	it("ignores the word from inside a string literal", async () => {
		const found = await scanSpecifiers(
			"const q = \"select id from users\";const r = 'delete from sessions';",
		);

		expect(found).toEqual([]);
	});

	it("skips a dynamic import over a computed expression", async () => {
		const found = await scanSpecifiers('const n = "pg";await import(n);');

		expect(found).toEqual([]);
	});
});

describe("findOffences", () => {
	it("reports a bare import and names the file that carries it", async () => {
		const root = await buildTree({
			"nested/chunk.js": 'import pg from "pg";import "./local.js";',
		});

		const offences = await findOffences(root, []);

		expect([...offences]).toEqual([[`${root}/nested/chunk.js`, ["pg"]]]);
	});

	it("passes a tree importing only built-ins and relatives", async () => {
		const root = await buildTree({
			"a.js": 'import fs from "node:fs";',
			"b.js": 'import { x } from "./a.js";',
		});

		await expect(findOffences(root, [])).resolves.toEqual(new Map());
	});

	it("passes a bare import whose package is allowlisted", async () => {
		const root = await buildTree({ "a.js": 'import api from "@opentelemetry/api/trace";' });

		await expect(findOffences(root, ["@opentelemetry/api"])).resolves.toEqual(new Map());
	});
});

// Guards the entry point itself: if the main block stops running, the check
// reports success while scanning nothing, and these are the only tests that
// would notice.
describe("the command", () => {
	it("exits non-zero and names the offending package", async () => {
		const root = await buildTree({ "chunk.js": 'import pg from "pg";' });

		const failure = await run(process.execPath, ["scripts/check-externals.ts", root]).catch(
			(err: { code: number; stderr: string }) => err,
		);

		expect(failure).toMatchObject({ code: 1 });
		expect((failure as { stderr: string }).stderr).toContain("pg");
	});

	it("exits zero on a clean tree", async () => {
		const root = await buildTree({ "chunk.js": 'import fs from "node:fs";' });

		const { stdout } = await run(process.execPath, ["scripts/check-externals.ts", root]);

		expect(stdout).toContain("resolves cleanly");
	});
});
