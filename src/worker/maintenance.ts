import { CronExpressionParser } from "cron-parser";
import { eq, lte, and } from "drizzle-orm";

import { CHECK_RETENTION_DAYS } from "../lib/constants/scheduler";
import { maintenanceJob } from "../lib/server/db/schema";
import { db } from "./db";
import { statsService } from "./stats";

type JobHandler = () => Promise<void>;

const jobHandlers: Record<string, JobHandler> = {
	"daily-stats": async () => {
		const count = await statsService.aggregateYesterday();
		console.log(`[Maintenance] Aggregated daily stats for ${count} monitors`);
	},
	"rolling-stats": async () => {
		const count = await statsService.updateAll24hStats();
		console.log(`[Maintenance] Updated 24h stats for ${count} monitors`);
	},
	cleanup: async () => {
		const deleted = await statsService.cleanupOldChecks(CHECK_RETENTION_DAYS);
		console.log(`[Maintenance] Deleted ${deleted} old check records`);
	},
};

/**
 * Initializes the maintenance jobs table with default jobs if empty.
 */
export async function initializeMaintenanceJobs(): Promise<void> {
	const existingJobs = await db.select().from(maintenanceJob);

	if (existingJobs.length > 0) {
		console.log(`[Maintenance] Found ${existingJobs.length} existing jobs`);
		return;
	}

	console.log("[Maintenance] Initializing default maintenance jobs...");

	const now = new Date();
	const jobs = [
		{
			id: "daily-stats",
			name: "Daily Stats Aggregation",
			cronExpression: "0 1 * * *", // 1:00 AM daily
			nextRunAt: calculateNextRun("0 1 * * *", now),
		},
		{
			id: "rolling-stats",
			name: "Rolling Stats Update",
			cronExpression: "*/5 * * * *", // Every 5 minutes
			nextRunAt: calculateNextRun("*/5 * * * *", now),
		},
		{
			id: "cleanup",
			name: "Old Check Cleanup",
			cronExpression: "0 2 * * *", // 2:00 AM daily
			nextRunAt: calculateNextRun("0 2 * * *", now),
		},
	];

	for (const job of jobs) {
		await db.insert(maintenanceJob).values(job).onConflictDoNothing();
		console.log(`[Maintenance] Created job: ${job.name}`);
	}
}

/**
 * Calculates the next run time based on a cron expression.
 */
function calculateNextRun(cronExpression: string, from: Date = new Date()): Date {
	const expression = CronExpressionParser.parse(cronExpression, { currentDate: from });
	return expression.next().toDate();
}

/**
 * Runs all due maintenance jobs using SKIP LOCKED for distributed safety.
 */
export async function runDueMaintenanceJobs(): Promise<void> {
	const now = new Date();

	// Find and lock due jobs
	const dueJobs = await db
		.select()
		.from(maintenanceJob)
		.where(and(eq(maintenanceJob.enabled, true), lte(maintenanceJob.nextRunAt, now)))
		.for("update", { skipLocked: true });

	for (const job of dueJobs) {
		const handler = jobHandlers[job.id];
		if (!handler) {
			console.warn(`[Maintenance] Unknown job handler: ${job.id}`);
			continue;
		}

		try {
			console.log(`[Maintenance] Running job: ${job.name}`);
			await handler();

			// Calculate next run time
			const nextRun = calculateNextRun(job.cronExpression);

			await db
				.update(maintenanceJob)
				.set({
					lastRunAt: now,
					nextRunAt: nextRun,
					lastError: null,
				})
				.where(eq(maintenanceJob.id, job.id));

			console.log(`[Maintenance] Completed: ${job.name}, next run: ${nextRun.toISOString()}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[Maintenance] Job ${job.name} failed:`, errorMessage);

			await db
				.update(maintenanceJob)
				.set({ lastError: errorMessage })
				.where(eq(maintenanceJob.id, job.id));
		}
	}
}
