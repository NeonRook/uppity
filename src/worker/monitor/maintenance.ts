import { CronExpressionParser } from "cron-parser";
import { eq, lte, and } from "drizzle-orm";

import {
	CHECK_RETENTION_DAYS,
	CRON_CLEANUP,
	CRON_DAILY_STATS,
	CRON_MAINTENANCE_WINDOW_TRANSITIONS,
	CRON_ROLLING_STATS,
	CRON_USAGE_SNAPSHOT,
} from "../../lib/constants/scheduler";
import type { Db } from "../../lib/server/db/index";
import { maintenanceJob } from "../../lib/server/db/schema";
import {
	childLogger,
	wideEvent,
	type MaintenanceWideEvent,
	type WideEventBuilder,
} from "../../lib/server/logger";
import { MaintenanceWindowService } from "../../lib/server/services/maintenance-window.service";
import { MeterService } from "../../lib/server/services/meter.service";
import { SubscriptionService } from "../../lib/server/services/subscription.service";
import { db } from "../shared/db";
import { statsService } from "./stats";

const maintenanceLogger = childLogger("maintenance");

type JobHandler = (event: WideEventBuilder<MaintenanceWideEvent>) => Promise<void>;

const JOBS: Record<string, { name: string; cron: string; run: JobHandler }> = {
	"daily-stats": {
		name: "Daily Stats Aggregation",
		cron: CRON_DAILY_STATS,
		run: async (event) => {
			event.set("records_processed", await statsService.aggregateYesterday());
		},
	},
	"rolling-stats": {
		name: "Rolling Stats Update",
		cron: CRON_ROLLING_STATS,
		run: async (event) => {
			event.set("records_processed", await statsService.updateAll24hStats());
		},
	},
	cleanup: {
		name: "Old Check Cleanup",
		cron: CRON_CLEANUP,
		run: async (event) => {
			event.set("records_deleted", await statsService.cleanupOldChecks(CHECK_RETENTION_DAYS));
		},
	},
	"maintenance-window-transitions": {
		name: "Maintenance Window Transitions",
		cron: CRON_MAINTENANCE_WINDOW_TRANSITIONS,
		run: async (event) => {
			const result = await new MaintenanceWindowService(db).runStatusTransitions();
			event.set("windows_started", result.started);
			event.set("windows_completed", result.completed);
		},
	},
	"usage-snapshot": {
		name: "Polar Usage Snapshot",
		cron: CRON_USAGE_SNAPSHOT,
		run: async (event) => {
			event.merge(await runUsageSnapshot(db, new MeterService(db)));
		},
	},
};

/**
 * Applies scheduled capacity reductions, then reports usage and blocks to Polar.
 *
 * The order is the point: reported first, a new period would meter the old peak and
 * the reduction would cost the customer another full period.
 */
export async function runUsageSnapshot(
	targetDb: Db,
	meterService: MeterService,
): Promise<Partial<MaintenanceWideEvent>> {
	// One cutoff for both: a period ending while the reports are in flight must neither
	// skip the sweep nor receive the old count.
	const at = new Date();
	const reductions = await new SubscriptionService(targetDb).applyScheduledReductions(at);
	const report = await meterService.reportUsageSnapshots();
	// The heartbeat gets a second chance tomorrow, so a failed report is logged inside
	// the service and recorded here as zero rather than failing the job.
	const blocks = await meterService.reportBlocks(undefined, at);

	return {
		block_reductions_applied: reductions,
		records_processed: report.customerSnapshots,
		org_records_processed: report.organizationSnapshots,
		block_records_processed: blocks.ok ? blocks.ingested : 0,
	};
}

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

	for (const [id, { name, cron }] of Object.entries(JOBS)) {
		await targetDb
			.insert(maintenanceJob)
			.values({ id, name, cronExpression: cron, nextRunAt: calculateNextRun(cron, now) })
			.onConflictDoNothing();
		maintenanceLogger.debug({ job_id: id, job_name: name }, "Ensured maintenance job");
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
		const handler = JOBS[job.id]?.run;
		if (!handler) {
			maintenanceLogger.warn({ job_id: job.id }, "Unknown job handler");
			continue;
		}

		// Create wide event for this job execution
		const event = wideEvent<MaintenanceWideEvent>("maintenance", "maintenance_job", "mnt");
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
