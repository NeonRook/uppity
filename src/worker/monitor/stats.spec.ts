import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

import { organization } from "../../lib/server/db/auth-schema";
import {
	incident,
	incidentMonitor,
	monitor,
	monitorCheck,
	monitorDailyStats,
	monitorStatus,
	subscription,
} from "../../lib/server/db/schema";
import { test } from "../../lib/server/test/fixture";
import type { TestDb } from "../../lib/server/test/harness";
import { StatsService } from "./stats";

/** Seeds an org (optionally on a plan) with one monitor, and returns the monitor id. */
async function seedOrgWithMonitor(drizzleDb: TestDb["db"], planId: string | null): Promise<string> {
	const suffix = nanoid();
	const orgId = `test-org-${suffix}`;
	await drizzleDb.insert(organization).values({
		id: orgId,
		name: `Test Org ${suffix}`,
		slug: `test-org-${suffix}`,
		createdAt: new Date(),
	});

	if (planId !== null) {
		await drizzleDb.insert(subscription).values({
			id: nanoid(),
			organizationId: orgId,
			planId,
			status: "active",
		});
	}

	const monitorId = nanoid();
	await drizzleDb.insert(monitor).values({
		id: monitorId,
		organizationId: orgId,
		name: `Monitor ${suffix}`,
		type: "http",
		url: "https://example.com",
		intervalSeconds: 300,
		timeoutSeconds: 30,
	});

	return monitorId;
}

async function seedCheckAged(
	drizzleDb: TestDb["db"],
	monitorId: string,
	daysAgo: number,
): Promise<void> {
	const checkedAt = new Date();
	checkedAt.setDate(checkedAt.getDate() - daysAgo);
	await drizzleDb.insert(monitorCheck).values({
		id: nanoid(),
		monitorId,
		status: "up",
		checkedAt,
	});
}

async function countChecks(drizzleDb: TestDb["db"], monitorId: string): Promise<number> {
	const rows = await drizzleDb
		.select({ id: monitorCheck.id })
		.from(monitorCheck)
		.where(eq(monitorCheck.monitorId, monitorId));
	return rows.length;
}

describe("StatsService.cleanupOldChecks", () => {
	beforeAll(() => {
		vi.stubEnv("SELF_HOSTED", "");
	});

	afterAll(() => {
		vi.unstubAllEnvs();
	});

	test("deletes a free org's 45-day-old checks but keeps an uppity org's", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatsService(drizzleDb);

		const freeMonitor = await seedOrgWithMonitor(drizzleDb, "free");
		const uppityMonitor = await seedOrgWithMonitor(drizzleDb, "uppity");
		await seedCheckAged(drizzleDb, freeMonitor, 45);
		await seedCheckAged(drizzleDb, uppityMonitor, 45);

		const deleted = await service.cleanupOldChecks(30);

		expect(deleted).toBe(1);
		expect(await countChecks(drizzleDb, freeMonitor)).toBe(0);
		expect(await countChecks(drizzleDb, uppityMonitor)).toBe(1);
	});

	test("keeps checks inside every plan's window", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatsService(drizzleDb);

		const freeMonitor = await seedOrgWithMonitor(drizzleDb, "free");
		await seedCheckAged(drizzleDb, freeMonitor, 10);

		const deleted = await service.cleanupOldChecks(30);

		expect(deleted).toBe(0);
		expect(await countChecks(drizzleDb, freeMonitor)).toBe(1);
	});

	test("treats an organization with no subscription row as free", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatsService(drizzleDb);

		const orphanMonitor = await seedOrgWithMonitor(drizzleDb, null);
		await seedCheckAged(drizzleDb, orphanMonitor, 45);

		const deleted = await service.cleanupOldChecks(30);

		expect(deleted).toBe(1);
		expect(await countChecks(drizzleDb, orphanMonitor)).toBe(0);
	});

	test("treats a retired plan id as free rather than retaining forever", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatsService(drizzleDb);

		const staleMonitor = await seedOrgWithMonitor(drizzleDb, "pro");
		await seedCheckAged(drizzleDb, staleMonitor, 45);

		const deleted = await service.cleanupOldChecks(30);

		expect(deleted).toBe(1);
		expect(await countChecks(drizzleDb, staleMonitor)).toBe(0);
	});

	test("self-hosted mode deletes across every organization at the fallback window", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new StatsService(drizzleDb);

		const freeMonitor = await seedOrgWithMonitor(drizzleDb, "free");
		const uppityMonitor = await seedOrgWithMonitor(drizzleDb, "uppity");
		await seedCheckAged(drizzleDb, freeMonitor, 45);
		await seedCheckAged(drizzleDb, uppityMonitor, 45);

		vi.stubEnv("SELF_HOSTED", "true");
		try {
			const deleted = await service.cleanupOldChecks(30);

			// The harness database is file-scoped, so earlier tests' surviving rows are
			// also in range here. Assert on these monitors rather than a global total.
			expect(deleted).toBeGreaterThanOrEqual(2);
			expect(await countChecks(drizzleDb, freeMonitor)).toBe(0);
			// The point of the test: uppity's 365-day plan window is ignored in
			// self-hosted mode, because the operator's value governs every tenant.
			expect(await countChecks(drizzleDb, uppityMonitor)).toBe(0);
		} finally {
			vi.stubEnv("SELF_HOSTED", "");
		}
	});
});

async function seedChecks(
	drizzleDb: TestDb["db"],
	monitorId: string,
	checkedAt: Date,
	checks: [status: string, responseTimeMs: number | null][],
): Promise<void> {
	await drizzleDb.insert(monitorCheck).values(
		checks.map(([status, responseTimeMs]) => ({
			id: nanoid(),
			monitorId,
			status,
			responseTimeMs,
			checkedAt,
		})),
	);
}

describe("StatsService aggregation", () => {
	test("aggregateDailyStats counts statuses and ignores down checks in response times", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new StatsService(drizzleDb);
		const monitorId = await seedOrgWithMonitor(drizzleDb, "free");

		const day = new Date();
		day.setDate(day.getDate() - 3);
		day.setHours(12, 0, 0, 0);
		await seedChecks(drizzleDb, monitorId, day, [
			["up", 100],
			["degraded", 201],
			["up", null],
			["down", 5000],
		]);

		await service.aggregateDailyStats(monitorId, day);

		const [stats] = await drizzleDb
			.select()
			.from(monitorDailyStats)
			.where(eq(monitorDailyStats.monitorId, monitorId));
		expect(stats).toMatchObject({
			totalChecks: 4,
			successfulChecks: 3,
			failedChecks: 1,
			degradedChecks: 1,
			avgResponseTimeMs: 151,
			minResponseTimeMs: 100,
			maxResponseTimeMs: 201,
			p95ResponseTimeMs: 196,
			uptimePercent: 75,
		});
	});

	test("aggregateDailyStats rolls up the UTC day", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatsService(drizzleDb);
		const monitorId = await seedOrgWithMonitor(drizzleDb, "free");

		const day = new Date();
		day.setUTCDate(day.getUTCDate() - 3);
		day.setUTCHours(0, 0, 0, 0);
		const lastMinute = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 60 * 1000);
		const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000 + 60 * 1000);
		await drizzleDb.insert(monitorCheck).values([
			{ id: nanoid(), monitorId, status: "up", checkedAt: lastMinute },
			{ id: nanoid(), monitorId, status: "down", checkedAt: nextDay },
		]);

		await service.aggregateDailyStats(monitorId, lastMinute);

		const [stats] = await drizzleDb
			.select()
			.from(monitorDailyStats)
			.where(eq(monitorDailyStats.monitorId, monitorId));
		expect(stats).toMatchObject({ date: day, totalChecks: 1, failedChecks: 0 });
	});

	test("aggregateDailyStats counts the incidents whose span overlaps the UTC day", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new StatsService(drizzleDb);

		const hour = 60 * 60 * 1000;
		const dayStart = new Date();
		dayStart.setUTCDate(dayStart.getUTCDate() - 3);
		dayStart.setUTCHours(0, 0, 0, 0);
		const at = (hours: number) => new Date(dayStart.getTime() + hours * hour);

		const spans: { startedAt: Date; resolvedAt?: Date; status?: string; counted: boolean }[] = [
			// Inside the day.
			{ startedAt: at(1), resolvedAt: at(2), status: "resolved", counted: true },
			// Resolved at the first instant of the day.
			{ startedAt: at(-5), resolvedAt: at(0), status: "resolved", counted: true },
			// Spans the whole day.
			{ startedAt: at(-5), resolvedAt: at(30), status: "resolved", counted: true },
			// Still open.
			{ startedAt: at(-5), status: "investigating", counted: true },
			// Reopened, so its resolvedAt no longer ends the span.
			{ startedAt: at(-5), resolvedAt: at(-4), status: "monitoring", counted: true },
			// Created as resolved, so it has no resolvedAt.
			{ startedAt: at(1), status: "resolved", counted: true },
			// Ended inside the day, then written up.
			{ startedAt: at(-5), resolvedAt: at(1), status: "postmortem", counted: true },
			// Ended before the day.
			{ startedAt: at(-5), resolvedAt: at(-1), status: "resolved", counted: false },
			// Ended before the day, then written up.
			{ startedAt: at(-5), resolvedAt: at(-1), status: "postmortem", counted: false },
			// Created as resolved before the day.
			{ startedAt: at(-5), status: "resolved", counted: false },
			// Started at the first instant of the next day.
			{ startedAt: at(24), resolvedAt: at(25), status: "resolved", counted: false },
		];

		const seedIncident = async (
			monitorId: string,
			values: { startedAt: Date; resolvedAt?: Date; status?: string },
		) => {
			const [{ organizationId }] = await drizzleDb
				.select({ organizationId: monitor.organizationId })
				.from(monitor)
				.where(eq(monitor.id, monitorId));
			const id = nanoid();
			await drizzleDb.insert(incident).values({ ...values, id, organizationId, title: id });
			await drizzleDb.insert(incidentMonitor).values({ incidentId: id, monitorId });
		};

		// One monitor per span: a shared total lets a wrong inclusion cancel a wrong exclusion.
		for (const { counted, ...span } of spans) {
			const monitorId = await seedOrgWithMonitor(drizzleDb, "free");
			await seedIncident(monitorId, span);
			const otherMonitorId = await seedOrgWithMonitor(drizzleDb, "free");
			await seedIncident(otherMonitorId, { startedAt: at(1) });
			await drizzleDb
				.insert(monitorCheck)
				.values({ id: nanoid(), monitorId, status: "up", checkedAt: at(12) });

			await service.aggregateDailyStats(monitorId, at(12));

			const [stats] = await drizzleDb
				.select()
				.from(monitorDailyStats)
				.where(eq(monitorDailyStats.monitorId, monitorId));
			expect({ ...span, incidentCount: stats.incidentCount }).toEqual({
				...span,
				incidentCount: counted ? 1 : 0,
			});
		}
	});

	test("aggregateDailyStats writes nothing for a day without checks", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatsService(drizzleDb);
		const monitorId = await seedOrgWithMonitor(drizzleDb, "free");

		await service.aggregateDailyStats(monitorId, new Date());

		const rows = await drizzleDb
			.select()
			.from(monitorDailyStats)
			.where(eq(monitorDailyStats.monitorId, monitorId));
		expect(rows).toHaveLength(0);
	});

	test("updateMonitor24hStats updates the status row", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatsService(drizzleDb);
		const monitorId = await seedOrgWithMonitor(drizzleDb, "free");
		await drizzleDb.insert(monitorStatus).values({ monitorId, status: "up" });

		await seedChecks(drizzleDb, monitorId, new Date(), [
			["up", 100],
			["down", null],
		]);

		await service.updateMonitor24hStats(monitorId);

		const [status] = await drizzleDb
			.select()
			.from(monitorStatus)
			.where(eq(monitorStatus.monitorId, monitorId));
		expect(status).toMatchObject({ uptimePercent24h: 50, avgResponseTimeMs24h: 100 });
	});
});
