import { CronExpressionParser } from "cron-parser";
import { eq, lte, and } from "drizzle-orm";

import { CHECK_RETENTION_DAYS } from "../lib/constants/scheduler";
import { maintenanceJob } from "../lib/server/db/schema";
import {
	createMaintenanceWideEvent,
	createMaintenanceLogger,
	type MaintenanceWideEvent,
	type WideEventBuilder,
} from "../lib/server/logger";
import { db } from "./db";
import { statsService } from "./stats";

const maintenanceLogger = createMaintenanceLogger();

type JobHandler = (event: WideEventBuilder<MaintenanceWideEvent>) => Promise<void>;

const jobHandlers: Record<string, JobHandler> = {
	"daily-stats": async (event) => {
		const count = await statsService.aggregateYesterday();
		event.set("records_processed", count);
	},
	"rolling-stats": async (event) => {
		const count = await statsService.updateAll24hStats();
		event.set("records_processed", count);
	},
	cleanup: async (event) => {
		const deleted = await statsService.cleanupOldChecks(CHECK_RETENTION_DAYS);
		event.set("records_deleted", deleted);
	},
};

/**
 * Initializes the maintenance jobs table with default jobs if empty.
 */
export async function initializeMaintenanceJobs(): Promise<void> {
	const existingJobs = await db.select().from(maintenanceJob);

	if (existingJobs.length > 0) {
		maintenanceLogger.debug({ count: existingJobs.length }, "Found existing maintenance jobs");
		return;
	}

	maintenanceLogger.info("Initializing default maintenance jobs");

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
		maintenanceLogger.info({ job_id: job.id, job_name: job.name }, "Created maintenance job");
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
			maintenanceLogger.warn({ job_id: job.id }, "Unknown job handler");
			continue;
		}

		// Create wide event for this job execution
		const event = createMaintenanceWideEvent(job.id);
		event.merge({
			job_id: job.id,
			job_name: job.name,
		});

		try {
			await handler(event);

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

			event.merge({
				next_run_at: nextRun,
			});
			event.setSuccess();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			await db
				.update(maintenanceJob)
				.set({ lastError: errorMessage })
				.where(eq(maintenanceJob.id, job.id));

			event.setError(error);
		} finally {
			event.emit("maintenance");
		}
	}
}
