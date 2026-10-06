import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

import { organization } from "../../lib/server/db/auth-schema";
import { maintenanceJob, subscription } from "../../lib/server/db/schema";
import { MeterService } from "../../lib/server/services/meter.service";
import { test } from "../../lib/server/test/fixture";
import type { TestDb } from "../../lib/server/test/harness";
import { initializeMaintenanceJobs, runUsageSnapshot } from "./maintenance";

async function getJob(drizzleDb: TestDb["db"], id: string) {
	const [row] = await drizzleDb.select().from(maintenanceJob).where(eq(maintenanceJob.id, id));
	return row;
}

describe("initializeMaintenanceJobs", () => {
	test("is idempotent: a second call adds no duplicate rows", async ({ db }) => {
		const { db: drizzleDb } = db;

		await initializeMaintenanceJobs(drizzleDb);
		await initializeMaintenanceJobs(drizzleDb);

		const rows = await drizzleDb
			.select()
			.from(maintenanceJob)
			.where(eq(maintenanceJob.id, "usage-snapshot"));
		expect(rows).toHaveLength(1);
	});

	test("preserves an operator-edited cron_expression and enabled flag", async ({ db }) => {
		const { db: drizzleDb } = db;

		await initializeMaintenanceJobs(drizzleDb);

		await drizzleDb
			.update(maintenanceJob)
			.set({ cronExpression: "0 0 * * 0", enabled: false })
			.where(eq(maintenanceJob.id, "cleanup"));

		await initializeMaintenanceJobs(drizzleDb);

		const job = await getJob(drizzleDb, "cleanup");
		expect(job.cronExpression).toBe("0 0 * * 0");
		expect(job.enabled).toBe(false);
	});

	test("inserts a job that is present in code but missing from the table", async ({ db }) => {
		const { db: drizzleDb } = db;

		await initializeMaintenanceJobs(drizzleDb);
		await drizzleDb.delete(maintenanceJob).where(eq(maintenanceJob.id, "usage-snapshot"));

		await initializeMaintenanceJobs(drizzleDb);

		const job = await getJob(drizzleDb, "usage-snapshot");
		expect(job).toBeTruthy();
		expect(job.nextRunAt).toBeInstanceOf(Date);
	});
});

describe("runUsageSnapshot", () => {
	beforeAll(() => {
		vi.stubEnv("SELF_HOSTED", "");
		vi.stubEnv("POLAR_ACCESS_TOKEN", "test-token");
	});

	afterAll(() => {
		vi.unstubAllEnvs();
	});

	test("applies a due reduction before reporting blocks", async ({ db }) => {
		const { db: drizzleDb } = db;
		const suffix = nanoid();
		const orgId = `test-org-${suffix}`;
		const polarCustomerId = `polar-cust-${suffix}`;
		await drizzleDb.insert(organization).values({
			id: orgId,
			name: `Test Org ${suffix}`,
			slug: `test-org-${suffix}`,
			createdAt: new Date(),
		});
		await drizzleDb.insert(subscription).values({
			id: nanoid(),
			organizationId: orgId,
			planId: "uppity",
			status: "active",
			blocks: 4,
			scheduledBlocks: 1,
			currentPeriodEnd: new Date(Date.now() - 60_000),
			polarCustomerId,
		});

		const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
		await runUsageSnapshot(drizzleDb, new MeterService(drizzleDb, ingest, 100));

		// Reported first, the new period would meter 4 and bill the old peak again.
		const reported = ingest.mock.calls
			.flatMap((call) => call[0] as { name: string; customer_id: string; metadata: unknown }[])
			.filter((e) => e.name === "monitor_blocks" && e.customer_id === polarCustomerId);
		expect(reported).toEqual([
			expect.objectContaining({ metadata: { blocks: 1, organization_count: 1 } }),
		]);
	});
});
