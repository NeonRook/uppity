import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { monitorCheck, monitorDailyStats } from "../db/schema";
import { test } from "../test/fixture";
import { seedMonitor, seedOrg } from "../test/seed";
import { ResponseHistoryService } from "./response-history.service";

/** Midnight UTC `daysAgo` days before today, plus `hours`. */
function utcDay(daysAgo: number, hours = 0): Date {
	const day = new Date();
	day.setUTCHours(0, 0, 0, 0);
	day.setUTCDate(day.getUTCDate() - daysAgo);
	return new Date(day.getTime() + hours * 3_600_000);
}

const key = (date: Date) => date.toISOString().slice(0, 10);

describe("ResponseHistoryService.daily", () => {
	test("reads rolled-up days, rolls up the rest live, and leaves empty days unknown", async ({
		db: { db },
	}) => {
		const orgId = await seedOrg(db);
		const monitorId = await seedMonitor(db, orgId);

		await db.insert(monitorDailyStats).values([
			{
				id: nanoid(),
				monitorId,
				date: utcDay(3),
				totalChecks: 10,
				successfulChecks: 10,
				degradedChecks: 2,
				avgResponseTimeMs: 120,
				p95ResponseTimeMs: 300,
			},
			{ id: nanoid(), monitorId, date: utcDay(2), totalChecks: 10, failedChecks: 10 },
		]);
		await db.insert(monitorCheck).values([
			// Already rolled up, so the rollup's figures stand.
			{ id: nanoid(), monitorId, status: "down", checkedAt: utcDay(3, 6) },
			{ id: nanoid(), monitorId, status: "up", responseTimeMs: 100, checkedAt: utcDay(1, 6) },
			{ id: nanoid(), monitorId, status: "down", checkedAt: utcDay(1, 7) },
			{ id: nanoid(), monitorId, status: "up", responseTimeMs: 50, checkedAt: utcDay(0) },
			{ id: nanoid(), monitorId, status: "up", responseTimeMs: 70, checkedAt: utcDay(0) },
		]);

		const days = await new ResponseHistoryService(db).daily(monitorId, 5);

		expect(days).toEqual([
			{ date: key(utcDay(4)), avgMs: null, p95Ms: null, status: "unknown" },
			{ date: key(utcDay(3)), avgMs: 120, p95Ms: 300, status: "degraded" },
			{ date: key(utcDay(2)), avgMs: null, p95Ms: null, status: "down" },
			{ date: key(utcDay(1)), avgMs: 100, p95Ms: 100, status: "partial" },
			{ date: key(utcDay(0)), avgMs: 60, p95Ms: 69, status: "up" },
		]);
	});

	test("rolls up every day live for a monitor with no rollups", async ({ db: { db } }) => {
		const orgId = await seedOrg(db);
		const monitorId = await seedMonitor(db, orgId);
		await db.insert(monitorCheck).values({
			id: nanoid(),
			monitorId,
			status: "degraded",
			responseTimeMs: 900,
			checkedAt: utcDay(2, 1),
		});

		const days = await new ResponseHistoryService(db).daily(monitorId, 3);

		expect(days.map((d) => d.status)).toEqual(["degraded", "unknown", "unknown"]);
	});
});
