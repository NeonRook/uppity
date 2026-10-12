import { WORKER_POLL_BATCH_SIZE, WORKER_BACKOFF } from "../../lib/constants/worker";
import { monitor } from "../../lib/server/db/schema";
import { childLogger, wideEvent, type CheckWideEvent } from "../../lib/server/logger";
import { client, db } from "../shared/db";
import { executeCheck } from "./check";
import { initializeMaintenanceJobs, runDueMaintenanceJobs } from "./maintenance";
import { SlotPool } from "./pool";
import { pendingMonitorIds, processResults } from "./processor";
import {
	claimDueMonitors,
	recordCheckFailure,
	recordCheckSuccess,
	releaseOverlongSchedules,
} from "./schedule";

const schedulerLogger = childLogger("scheduler");
const processorLogger = childLogger("processor");

// Catches results whose notification was missed, such as while the LISTEN connection reconnected.
const RESULT_SWEEP_INTERVAL_MS = 15_000;

let running = true;
let currentBackoffMs = WORKER_BACKOFF.INITIAL_MS;

/**
 * Processes a single monitor check.
 */
async function processMonitor(m: typeof monitor.$inferSelect) {
	// Create wide event for this check
	const event = wideEvent<CheckWideEvent>("scheduler", "monitor_check", "chk");
	event.merge({
		monitor_id: m.id,
		monitor_name: m.name,
		monitor_type: m.type as "http" | "tcp" | "push",
		org_id: m.organizationId,
	});

	try {
		await executeCheck(m, db, event);
		await recordCheckSuccess(db, m);
	} catch (error) {
		event.setError(error);
		await recordCheckFailure(db, m, error);
	} finally {
		event.emit("check");
	}
}

let sleepResolve: (() => void) | null = null;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		sleepResolve = resolve;
		setTimeout(() => {
			sleepResolve = null;
			resolve();
		}, ms);
	});
}

function interruptSleep(): void {
	if (sleepResolve) {
		sleepResolve();
		sleepResolve = null;
	}
}

// Wall clock rather than loop count, so a busy instance still reaches maintenance.
const MAINTENANCE_INTERVAL_MS = 60_000;

/**
 * Main polling loop with adaptive backoff.
 */
async function pollLoop() {
	let lastMaintenanceAt = 0;
	// Seeded inside the guarded loop: during a migration the table can be briefly unwritable,
	// and the worker must keep checking monitors until it is.
	let jobsSeeded = false;
	const pool = new SlotPool(WORKER_POLL_BATCH_SIZE);

	// oxlint-disable-next-line no-unmodified-loop-condition -- modified by shutdown() signal handler
	while (running) {
		try {
			if (Date.now() - lastMaintenanceAt >= MAINTENANCE_INTERVAL_MS) {
				// Stamped first, so a failing pass waits out the interval instead of spinning.
				lastMaintenanceAt = Date.now();
				if (!jobsSeeded) {
					await initializeMaintenanceJobs();
					jobsSeeded = true;
				}
				await runDueMaintenanceJobs();
				await releaseOverlongSchedules(db);
			}

			await pool.slotFree();
			if (!running) break;

			// Claims only what can start now, so no lease runs down while a monitor waits.
			const monitors = await claimDueMonitors(db, pool.free);

			if (monitors.length > 0) {
				currentBackoffMs = WORKER_BACKOFF.INITIAL_MS;
				schedulerLogger.debug({ count: monitors.length }, "Claimed monitors for checking");

				for (const m of monitors) {
					pool.start(() =>
						processMonitor(m).catch((error: unknown) =>
							schedulerLogger.error({ error, monitor_id: m.id }, "Check failed to record"),
						),
					);
				}
				continue;
			}

			// No work found - apply exponential backoff
			await sleep(currentBackoffMs);
			currentBackoffMs = Math.min(
				currentBackoffMs * WORKER_BACKOFF.MULTIPLIER,
				WORKER_BACKOFF.MAX_MS,
			);
		} catch (error) {
			schedulerLogger.error({ error }, "Poll loop error");
			await sleep(WORKER_BACKOFF.MAX_MS);
		}
	}

	await pool.drain();
}

const processing = new Set<Promise<void>>();

/** Interprets a monitor's waiting results; overlapping calls for one monitor queue in the database. */
function processMonitorResults(monitorId: string): Promise<void> {
	const work = processResults(db, monitorId)
		.then(() => undefined)
		.catch((error: unknown) =>
			processorLogger.error({ error, monitor_id: monitorId }, "Result processing failed"),
		);
	processing.add(work);
	void work.finally(() => processing.delete(work));
	return work;
}

async function sweepResults(): Promise<void> {
	try {
		for (const monitorId of await pendingMonitorIds(db)) await processMonitorResults(monitorId);
	} catch (error) {
		processorLogger.error({ error }, "Result sweep failed");
	}
}

let stopProcessing: (() => Promise<void>) | null = null;

/** Processes results as they are inserted, whoever inserts them, with a sweep behind. */
async function startResultProcessor(): Promise<void> {
	await sweepResults();
	const subscription = await client.listen("monitor_check", (monitorId) => {
		if (running) void processMonitorResults(monitorId);
	});
	const sweepTimer = setInterval(() => {
		if (running) void sweepResults();
	}, RESULT_SWEEP_INTERVAL_MS);
	stopProcessing = async () => {
		clearInterval(sweepTimer);
		await subscription.unlisten();
		await Promise.allSettled(processing);
	};
	processorLogger.info("Listening on channel monitor_check");
}

// Graceful shutdown
function shutdown(signal: string): void {
	schedulerLogger.info({ signal }, "Received shutdown signal");
	running = false;
	interruptSleep();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start worker
async function start() {
	schedulerLogger.info(
		{
			concurrent_checks: WORKER_POLL_BATCH_SIZE,
			backoff_initial_ms: WORKER_BACKOFF.INITIAL_MS,
			backoff_max_ms: WORKER_BACKOFF.MAX_MS,
		},
		"Starting monitor scheduler worker",
	);

	await startResultProcessor();
	await pollLoop();
	await stopProcessing?.();

	schedulerLogger.info("Shutdown complete");
	process.exit(0);
}

start().catch((error) => {
	schedulerLogger.fatal({ error }, "Fatal error");
	process.exit(1);
});
