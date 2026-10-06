import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";

import { CHECK_RETRY } from "../../lib/constants/worker";
import { monitor, notificationEvent, type Monitor } from "../../lib/server/db/schema";
import { test } from "../../lib/server/test/fixture";
import type { TestDb } from "../../lib/server/test/harness";
import { seedMonitor, seedOrg } from "../../lib/server/test/seed";
import { recordCheckFailure, recordCheckSuccess } from "./schedule";

async function load(drizzleDb: TestDb["db"], id: string): Promise<Monitor> {
	const [row] = await drizzleDb.select().from(monitor).where(eq(monitor.id, id));
	return row;
}

function eventTypes(drizzleDb: TestDb["db"], monitorId: string) {
	return drizzleDb
		.select({ type: notificationEvent.type })
		.from(notificationEvent)
		.where(eq(notificationEvent.monitorId, monitorId))
		.then((rows) => rows.map((r) => r.type));
}

async function seedFailing(drizzleDb: TestDb["db"], retries: number): Promise<string> {
	const id = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));
	await drizzleDb.update(monitor).set({ checkRetryCount: retries }).where(eq(monitor.id, id));
	return id;
}

describe("recordCheckFailure", () => {
	test("backs off below MAX_ATTEMPTS without dead-lettering", async ({ db }) => {
		const { db: drizzleDb } = db;
		const id = await seedFailing(drizzleDb, 0);

		await recordCheckFailure(drizzleDb, await load(drizzleDb, id), new Error("boom"));

		const row = await load(drizzleDb, id);
		expect(row.checkRetryCount).toBe(1);
		expect(row.deadLetteredAt).toBeNull();
		expect(await eventTypes(drizzleDb, id)).toEqual([]);
	});

	test("the failure reaching MAX_ATTEMPTS dead-letters and notifies once", async ({ db }) => {
		const { db: drizzleDb } = db;
		const id = await seedFailing(drizzleDb, CHECK_RETRY.MAX_ATTEMPTS - 1);

		await recordCheckFailure(drizzleDb, await load(drizzleDb, id), new Error("boom"));

		const row = await load(drizzleDb, id);
		expect(row.deadLetteredAt).not.toBeNull();
		expect(row.checkLastError).toBe("boom");
		expect(await eventTypes(drizzleDb, id)).toEqual(["monitor_checks_stopped"]);
	});

	test("a dead-lettered monitor keeps retrying within the capped backoff, silently", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const id = await seedFailing(drizzleDb, CHECK_RETRY.MAX_ATTEMPTS - 1);
		await recordCheckFailure(drizzleDb, await load(drizzleDb, id), new Error("boom"));
		const enteredAt = (await load(drizzleDb, id)).deadLetteredAt;

		// Far past MAX_ATTEMPTS, where the uncapped backoff would be days.
		await drizzleDb.update(monitor).set({ checkRetryCount: 40 }).where(eq(monitor.id, id));
		const before = Date.now();
		await recordCheckFailure(drizzleDb, await load(drizzleDb, id), new Error("boom"));

		const row = await load(drizzleDb, id);
		expect(row.deadLetteredAt).toEqual(enteredAt);
		expect(row.nextCheckAt!.getTime()).toBeLessThanOrEqual(
			before + CHECK_RETRY.MAX_BACKOFF_MS + 5_000,
		);
		expect(await eventTypes(drizzleDb, id)).toEqual(["monitor_checks_stopped"]);
	});
});

describe("recordCheckSuccess", () => {
	test("ends dead letter and notifies that checks resumed", async ({ db }) => {
		const { db: drizzleDb } = db;
		const id = await seedFailing(drizzleDb, CHECK_RETRY.MAX_ATTEMPTS - 1);
		await recordCheckFailure(drizzleDb, await load(drizzleDb, id), new Error("boom"));

		await recordCheckSuccess(drizzleDb, await load(drizzleDb, id));

		const row = await load(drizzleDb, id);
		expect(row.deadLetteredAt).toBeNull();
		expect(row.checkRetryCount).toBe(0);
		expect(row.checkLastError).toBeNull();
		expect((await eventTypes(drizzleDb, id)).toSorted()).toEqual([
			"monitor_checks_resumed",
			"monitor_checks_stopped",
		]);
	});

	test("enqueues nothing for a monitor that was not dead-lettered", async ({ db }) => {
		const { db: drizzleDb } = db;
		const id = await seedFailing(drizzleDb, 1);

		await recordCheckSuccess(drizzleDb, await load(drizzleDb, id));

		expect((await load(drizzleDb, id)).checkRetryCount).toBe(0);
		expect(await eventTypes(drizzleDb, id)).toEqual([]);
	});
});
