import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

import { organization } from "../../lib/server/db/auth-schema";
import { monitor, monitorCheck, subscription } from "../../lib/server/db/schema";
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
