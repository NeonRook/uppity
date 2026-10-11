import { eq, sql } from "drizzle-orm";
import { describe, expect } from "vitest";

import { checksOverdue, checksStopped, OVERDUE_AFTER_SECONDS, overdueChecks } from "./check-state";
import { monitor } from "./db/schema";
import { test } from "./test/fixture";
import type { TestDb } from "./test/harness";
import { seedMonitor, seedOrg } from "./test/seed";

const late = sql`NOW() - make_interval(secs => ${OVERDUE_AFTER_SECONDS + 60})`;

async function state(drizzleDb: TestDb["db"], id: string) {
	const [row] = await drizzleDb
		.select({ overdue: checksOverdue, stopped: checksStopped })
		.from(monitor)
		.where(eq(monitor.id, id));
	return row;
}

describe("checksStopped", () => {
	test("a monitor due a moment ago is still checked", async ({ db }) => {
		const { db: drizzleDb } = db;
		const id = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));

		expect(await state(drizzleDb, id)).toEqual({ overdue: false, stopped: false });
	});

	test("a monitor no worker picked up reads as not checked, without dead letter", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const id = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));
		await drizzleDb.update(monitor).set({ nextCheckAt: late }).where(eq(monitor.id, id));

		expect(await state(drizzleDb, id)).toEqual({ overdue: true, stopped: true });
	});

	test("a claim still within its lease is not overdue", async ({ db }) => {
		const { db: drizzleDb } = db;
		const id = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));
		await drizzleDb
			.update(monitor)
			.set({ nextCheckAt: late, checkBackoffUntil: sql`NOW() + INTERVAL '1 minute'` })
			.where(eq(monitor.id, id));

		expect(await state(drizzleDb, id)).toEqual({ overdue: false, stopped: false });
	});

	test("a dead-lettered monitor on schedule is stopped but not overdue", async ({ db }) => {
		const { db: drizzleDb } = db;
		const id = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));
		await drizzleDb
			.update(monitor)
			.set({ deadLetteredAt: new Date(), nextCheckAt: sql`NOW() + INTERVAL '5 minutes'` })
			.where(eq(monitor.id, id));

		expect(await state(drizzleDb, id)).toEqual({ overdue: false, stopped: true });
	});

	test("a paused monitor is never stopped, however stale", async ({ db }) => {
		const { db: drizzleDb } = db;
		const id = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));
		await drizzleDb
			.update(monitor)
			.set({ active: false, nextCheckAt: late, deadLetteredAt: new Date() })
			.where(eq(monitor.id, id));

		expect(await state(drizzleDb, id)).toEqual({ overdue: false, stopped: false });
	});
});

describe("overdueChecks", () => {
	test("counts overdue monitors across organizations and finds the oldest", async ({ db }) => {
		const { db: drizzleDb } = db;
		const before = (await overdueChecks(drizzleDb)).overdue;

		const a = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));
		const b = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));
		await seedMonitor(drizzleDb, await seedOrg(drizzleDb));
		const oldest = new Date(Date.now() - 86_400_000);
		await drizzleDb.update(monitor).set({ nextCheckAt: oldest }).where(eq(monitor.id, a));
		await drizzleDb.update(monitor).set({ nextCheckAt: late }).where(eq(monitor.id, b));

		const result = await overdueChecks(drizzleDb);
		expect(result.overdue).toBe(before + 2);
		expect(result.oldestDueAt?.getTime()).toBe(oldest.getTime());
	});
});
