import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

import { organization } from "../../lib/server/db/auth-schema";
import { maintenanceJob, subscription } from "../../lib/server/db/schema";
import { MeterService } from "../../lib/server/services/meter.service";
import { test } from "../../lib/server/test/fixture";
import type { TestDb } from "../../lib/server/test/harness";
import { initializeMaintenanceJobs, runDueMaintenanceJobs, runUsageSnapshot } from "./maintenance";

const RETRY_MS = 15 * 60_000;

async function insertDueJob(drizzleDb: TestDb["db"], id: string, cronExpression: string) {
	await drizzleDb.insert(maintenanceJob).values({
		id,
		name: id,
		cronExpression,
		nextRunAt: new Date(Date.now() - 60_000),
	});
}

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

describe("runDueMaintenanceJobs", () => {
	test("a successful job clears its error and moves to the next cron slot", async ({ db }) => {
		const { db: drizzleDb } = db;
		await insertDueJob(drizzleDb, "ok", "0 0 1 1 *");
		await drizzleDb
			.update(maintenanceJob)
			.set({ lastError: "earlier" })
			.where(eq(maintenanceJob.id, "ok"));
		const run = vi.fn().mockResolvedValue(undefined);

		await runDueMaintenanceJobs(drizzleDb, { ok: { name: "ok", cron: "0 0 1 1 *", run } });

		const job = await getJob(drizzleDb, "ok");
		expect(run).toHaveBeenCalledOnce();
		expect(job.lastError).toBeNull();
		expect(job.lastRunAt).toBeInstanceOf(Date);
		expect(job.nextRunAt.getTime()).toBeGreaterThan(Date.now() + RETRY_MS);
	});

	test("a failing job records its error and backs off instead of staying due", async ({ db }) => {
		const { db: drizzleDb } = db;
		await insertDueJob(drizzleDb, "broken", "0 0 1 1 *");
		const run = vi.fn().mockRejectedValue(new Error("boom"));
		const jobs = { broken: { name: "broken", cron: "0 0 1 1 *", run } };

		const before = Date.now();
		await runDueMaintenanceJobs(drizzleDb, jobs);
		await runDueMaintenanceJobs(drizzleDb, jobs);

		const job = await getJob(drizzleDb, "broken");
		expect(run).toHaveBeenCalledOnce();
		expect(job.lastError).toBe("boom");
		expect(job.lastRunAt).toBeNull();
		expect(job.nextRunAt.getTime()).toBeGreaterThanOrEqual(before + RETRY_MS);
		expect(job.nextRunAt.getTime()).toBeLessThanOrEqual(Date.now() + RETRY_MS);
	});

	test("a failing job retries no later than its next cron slot", async ({ db }) => {
		const { db: drizzleDb } = db;
		await insertDueJob(drizzleDb, "minutely", "* * * * *");
		const run = vi.fn().mockRejectedValue(new Error("boom"));

		await runDueMaintenanceJobs(drizzleDb, { minutely: { name: "m", cron: "* * * * *", run } });

		const job = await getJob(drizzleDb, "minutely");
		expect(job.nextRunAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
	});

	test("concurrent passes run a due job once", async ({ db }) => {
		const { db: drizzleDb } = db;
		await insertDueJob(drizzleDb, "once", "0 0 1 1 *");
		const run = vi.fn().mockResolvedValue(undefined);
		const jobs = { once: { name: "once", cron: "0 0 1 1 *", run } };
		// Open both connections up front, or the second pass queues behind the first
		// and never sees the job as due.
		await Promise.all([drizzleDb.execute(sql`select 1`), drizzleDb.execute(sql`select 1`)]);

		await Promise.all([
			runDueMaintenanceJobs(drizzleDb, jobs),
			runDueMaintenanceJobs(drizzleDb, jobs),
		]);

		expect(run).toHaveBeenCalledOnce();
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

	test("stamps block events with the cutoff the sweep used", async ({ db }) => {
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
			// Not yet due at the cutoff; the period may end while the report is in flight.
			currentPeriodEnd: new Date(Date.now() + 60_000),
			polarCustomerId,
		});

		const before = Date.now();
		const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
		await runUsageSnapshot(drizzleDb, new MeterService(drizzleDb, ingest, 100));

		const event = ingest.mock.calls
			.flatMap((call) => call[0] as { name: string; customer_id: string; timestamp?: string }[])
			.find((e) => e.name === "monitor_blocks" && e.customer_id === polarCustomerId);
		// Stamped at the cutoff, the old count lands in the period that billed it.
		expect(event?.timestamp).toBeDefined();
		const stamped = Date.parse(event?.timestamp ?? "");
		expect(stamped).toBeGreaterThanOrEqual(before);
		expect(stamped).toBeLessThan(before + 60_000);
	});
});
