import { eq, sql } from "drizzle-orm";
import { describe, expect } from "vitest";

import { CHECK_RETRY } from "../lib/constants/worker";
import type { Db } from "../lib/server/db/index";
import { monitor, monitorStatus, notificationEvent } from "../lib/server/db/schema";
import { NotificationService } from "../lib/server/notifications/service";
import { test } from "../lib/server/test/fixture";
import { seedMonitor, seedOrg } from "../lib/server/test/seed";
import { claimDueMonitors, recordCheckFailure, recordCheckSuccess } from "./monitor/schedule";

/**
 * The workers deploy alongside the web tier, whose pre-deploy step runs the
 * migrations, so they can start against a schema without dead_lettered_at.
 * Seeding goes first because inserts name every column.
 */
async function withoutDeadLetterColumn(db: Db, fn: () => Promise<void>): Promise<void> {
	await db.execute(sql`ALTER TABLE monitor DROP COLUMN dead_lettered_at`);
	try {
		await fn();
	} finally {
		await db.execute(sql`ALTER TABLE monitor ADD COLUMN dead_lettered_at timestamp with time zone`);
	}
}

describe("workers before the dead-letter column exists", () => {
	test("the monitor worker claims, records and backs off without it", async ({ db }) => {
		const { db: drizzleDb } = db;
		const id = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));

		await withoutDeadLetterColumn(drizzleDb, async () => {
			const claimed = (await claimDueMonitors(drizzleDb)).find((m) => m.id === id)!;
			expect(claimed.deadLetteredAt).toBeNull();

			const failing = { ...claimed, checkRetryCount: CHECK_RETRY.MAX_ATTEMPTS - 1 };
			await recordCheckFailure(drizzleDb, failing, new Error("boom"));
			const [failed] = await drizzleDb
				.select({ retries: monitor.checkRetryCount })
				.from(monitor)
				.where(eq(monitor.id, id));
			expect(failed.retries).toBe(CHECK_RETRY.MAX_ATTEMPTS);

			await recordCheckSuccess(drizzleDb, claimed);
		});

		const [row] = await drizzleDb.select().from(monitor).where(eq(monitor.id, id));
		expect(row.checkRetryCount).toBe(0);
		expect(row.checkBackoffUntil).toBeNull();
		const events = await drizzleDb
			.select({ id: notificationEvent.id })
			.from(notificationEvent)
			.where(eq(notificationEvent.monitorId, id));
		expect(events).toEqual([]);
	});

	test("the notifier dispatches monitor events without it", async ({ db }) => {
		const { db: drizzleDb } = db;
		const organizationId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, organizationId);
		await drizzleDb.insert(monitorStatus).values({ monitorId, status: "down" });

		await withoutDeadLetterColumn(drizzleDb, async () => {
			const result = await new NotificationService(drizzleDb).dispatchEvent({
				id: "evt-schema-lag",
				organizationId,
				monitorId,
				incidentId: null,
				type: "monitor_down",
				payload: { previousStatus: "up", newStatus: "down", consecutiveFailures: 1, checkId: "c" },
				status: "processing",
				claimedAt: new Date(),
				processedAt: null,
				errorMessage: null,
				createdAt: new Date(),
			});

			// Reaching the channel lookup means the monitor and status reads succeeded.
			expect(result).toEqual({ status: "suppressed", errorMessage: "no channels configured" });
		});
	});

	test("dead letter is tracked once the column exists", async ({ db }) => {
		const { db: drizzleDb } = db;
		const id = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));
		const claimed = (await claimDueMonitors(drizzleDb)).find((m) => m.id === id)!;

		await recordCheckFailure(
			drizzleDb,
			{ ...claimed, checkRetryCount: CHECK_RETRY.MAX_ATTEMPTS - 1 },
			new Error("boom"),
		);

		const [row] = await drizzleDb.select().from(monitor).where(eq(monitor.id, id));
		expect(row.deadLetteredAt).not.toBeNull();
	});
});
