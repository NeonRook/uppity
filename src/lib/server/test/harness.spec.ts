import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { test } from "./fixture";
import { adminUrlFrom, buildUrl } from "./harness";

describe("adminUrlFrom", () => {
	it("swaps the database path segment with 'postgres'", () => {
		expect(adminUrlFrom("postgres://u:p@host:5432/some_db")).toBe(
			"postgres://u:p@host:5432/postgres",
		);
	});

	it("preserves query parameters", () => {
		expect(adminUrlFrom("postgres://u:p@host:5432/app?sslmode=require")).toBe(
			"postgres://u:p@host:5432/postgres?sslmode=require",
		);
	});

	it("throws when the URL has no database segment", () => {
		expect(() => adminUrlFrom("postgres://u:p@host:5432")).toThrow(/database/i);
	});
});

describe("buildUrl", () => {
	it("rewrites the database path segment to the given name", () => {
		expect(buildUrl("postgres://u:p@host:5432/ignored", "test_abc")).toBe(
			"postgres://u:p@host:5432/test_abc",
		);
	});
});

describe("fixture integration", () => {
	test("provisions a file-scoped database with migrations applied", async ({ db }) => {
		const [row] = await db.db.execute<{ n: number }>(sql`SELECT 1 AS n`);
		expect(row?.n).toBe(1);
	});

	test("has the migrated schema available", async ({ db }) => {
		const [row] = await db.db.execute<{ count: string }>(
			sql`SELECT count(*)::text AS count FROM information_schema.tables WHERE table_name = 'monitor'`,
		);
		expect(row?.count).toBe("1");
	});

	test("supports LISTEN/NOTIFY on the per-file database", async ({ db }) => {
		const received: string[] = [];
		const unlisten = await db.listen("test_channel", (payload) => {
			received.push(payload);
		});

		await db.client.unsafe(`NOTIFY test_channel, 'hello'`);
		const deadline = Date.now() + 2000;
		while (!received.includes("hello") && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 10));
		}

		expect(received).toContain("hello");
		await unlisten();
	});
});
