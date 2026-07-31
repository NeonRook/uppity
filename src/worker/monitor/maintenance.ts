import { CronExpressionParser } from "cron-parser";
import { eq, lte, and } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
	CHECK_RETENTION_DAYS,
	CRON_CLEANUP,
	CRON_DAILY_STATS,
	CRON_MAINTENANCE_WINDOW_TRANSITIONS,
	CRON_ROLLING_STATS,
	CRON_USAGE_SNAPSHOT,
} from "../../lib/constants/scheduler";
import { maintenanceJob } from "../../lib/server/db/schema";
import type * as schema from "../../lib/server/db/schema";
import {
	createMaintenanceWideEvent,
	createMaintenanceLogger,
	type MaintenanceWideEvent,
	type WideEventBuilder,
} from "../../lib/server/logger";
import { MaintenanceWindowService } from "../../lib/server/services/maintenance-window.service";
import { MeterService } from "../../lib/server/services/meter.service";
import { db } from "../shared/db";
import { statsService } from "./stats";

type Db = PostgresJsDatabase<typeof schema>;

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
	"maintenance-window-transitions": async (event) => {
		const result = await new MaintenanceWindowService(db).runStatusTransitions();
		event.set("windows_started", result.started);
		event.set("windows_completed", result.completed);
	},
	"usage-snapshot": async (event) => {
		const reported = await new MeterService(db).reportUsageSnapshots();
		event.set("records_processed", reported);
	},
};

/**
 * Ensures every known job row exists, inserting on the primary key and
 * ignoring conflicts. Runs unconditionally on every boot — existing rows
 * (including operator edits to `cronExpression` or `enabled`) are left alone.
 */
export async function initializeMaintenanceJobs(targetDb: Db = db): Promise<void> {
	// Every job is inserted on every boot with onConflictDoNothing. Existing rows
	// keep their schedule and run history; jobs added in a later release get
	// created on the next deploy instead of silently never running.
	const now = new Date();
	const jobs = [
		{
			id: "daily-stats",
			name: "Daily Stats Aggregation",
			cronExpression: CRON_DAILY_STATS,
			nextRunAt: calculateNextRun(CRON_DAILY_STATS, now),
		},
		{
			id: "rolling-stats",
			name: "Rolling Stats Update",
			cronExpression: CRON_ROLLING_STATS,
			nextRunAt: calculateNextRun(CRON_ROLLING_STATS, now),
		},
		{
			id: "cleanup",
			name: "Old Check Cleanup",
			cronExpression: CRON_CLEANUP,
			nextRunAt: calculateNextRun(CRON_CLEANUP, now),
		},
		{
			id: "maintenance-window-transitions",
			name: "Maintenance Window Transitions",
			cronExpression: CRON_MAINTENANCE_WINDOW_TRANSITIONS,
			nextRunAt: calculateNextRun(CRON_MAINTENANCE_WINDOW_TRANSITIONS, now),
		},
		{
			id: "usage-snapshot",
			name: "Polar Usage Snapshot",
			cronExpression: CRON_USAGE_SNAPSHOT,
			nextRunAt: calculateNextRun(CRON_USAGE_SNAPSHOT, now),
		},
	];

	for (const job of jobs) {
		await targetDb.insert(maintenanceJob).values(job).onConflictDoNothing();
		maintenanceLogger.debug({ job_id: job.id, job_name: job.name }, "Ensured maintenance job");
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
