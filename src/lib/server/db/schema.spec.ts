import { eq, getTableColumns, is, sql } from "drizzle-orm";
import { PgTable, PgTimestamp } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { test } from "../test/fixture";
import { seedMonitor, seedOrg } from "../test/seed";
import * as schema from "./schema";

describe("timestamp columns", () => {
	it("all carry a time zone", () => {
		const naive = Object.values(schema)
			.filter((table) => is(table, PgTable))
			.flatMap((table) => Object.values(getTableColumns(table)))
			.filter((column) => is(column, PgTimestamp) && !column.withTimezone)
			.map((column) => column.name);

		expect(naive).toEqual([]);
	});

	test("default to the current instant in a session outside UTC", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		const createdAt = await db.db.transaction(async (tx) => {
			await tx.execute(sql`SET LOCAL TimeZone = 'Pacific/Honolulu'`);
			const id = await seedMonitor(tx, orgId);
			const [row] = await tx
				.select({ createdAt: schema.monitor.createdAt })
				.from(schema.monitor)
				.where(eq(schema.monitor.id, id));
			return row?.createdAt;
		});

		expect(Math.abs(Date.now() - (createdAt?.getTime() ?? 0))).toBeLessThan(60_000);
	});
});
