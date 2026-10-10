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

/** How long a claimed job holds its slot before another pass may retry it. */
const JOB_RETRY_MS = 15 * 60_000;

type JobHandler = (event: WideEventBuilder<MaintenanceWideEvent>) => Promise<void>;
type JobRegistry = Record<string, { name: string; cron: string; run: JobHandler }>;

const JOBS: JobRegistry = {
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
			const result = await runUsageSnapshot(db, new MeterService(db));
			event.merge(result);
			if (result.usage_report_failure || result.block_report_failure) {
				throw new Error("Polar did not receive every usage report");
			}
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
	const blocks = await meterService.reportBlocks(undefined, at);

	return {
		block_reductions_applied: reductions,
		records_processed: report.customerSnapshots,
		org_records_processed: report.organizationSnapshots,
		block_records_processed: blocks.ok ? blocks.ingested : 0,
		usage_report_failure: report.failure,
		block_report_failure: blocks.ok ? undefined : blocks.reason,
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
 * Runs every due maintenance job that this pass manages to claim.
 *
 * Claiming moves `nextRunAt` to the next cron slot or the retry delay, whichever
 * comes first, before the handler runs. A concurrent pass sees the job as not due,
 * and a job that fails or dies mid-run is retried after the delay instead of on
 * every pass.
 */
export async function runDueMaintenanceJobs(
	targetDb: Db = db,
	jobs: JobRegistry = JOBS,
): Promise<void> {
	const now = new Date();

	const dueJobs = await targetDb
		.select()
		.from(maintenanceJob)
		.where(and(eq(maintenanceJob.enabled, true), lte(maintenanceJob.nextRunAt, now)));

	for (const job of dueJobs) {
		const handler = jobs[job.id]?.run;
		if (!handler) {
			maintenanceLogger.warn({ job_id: job.id }, "Unknown job handler");
			continue;
		}

		const retryAt = new Date(
			Math.min(calculateNextRun(job.cronExpression, now).getTime(), now.getTime() + JOB_RETRY_MS),
		);
		const claimed = await targetDb
			.update(maintenanceJob)
			.set({ nextRunAt: retryAt })
			.where(and(eq(maintenanceJob.id, job.id), lte(maintenanceJob.nextRunAt, now)))
			.returning({ id: maintenanceJob.id });
		if (claimed.length === 0) continue;

		const event = wideEvent<MaintenanceWideEvent>("maintenance", "maintenance_job", "mnt");
		event.merge({ job_id: job.id, job_name: job.name });

		try {
			await handler(event);

			const nextRun = calculateNextRun(job.cronExpression);
			await targetDb
				.update(maintenanceJob)
				.set({ lastRunAt: now, nextRunAt: nextRun, lastError: null })
				.where(eq(maintenanceJob.id, job.id));

			event.merge({ next_run_at: nextRun });
			event.setSuccess();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			await targetDb
				.update(maintenanceJob)
				.set({ lastError: errorMessage })
				.where(eq(maintenanceJob.id, job.id));

			event.merge({ next_run_at: retryAt });
			event.setError(error);
		} finally {
			event.emit("maintenance");
		}
	}
}
