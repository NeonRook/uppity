import { describe, expect, it } from "vitest";

import { disallowedFrom, packageNameOf } from "./check-externals";

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
