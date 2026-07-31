import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";

import { maintenanceJob } from "../../lib/server/db/schema";
import { test } from "../../lib/server/test/fixture";
import type { TestDb } from "../../lib/server/test/harness";
import { initializeMaintenanceJobs } from "./maintenance";

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
