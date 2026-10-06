import { sql, inArray } from "drizzle-orm";

import { WORKER_POLL_BATCH_SIZE, WORKER_BACKOFF } from "../../lib/constants/worker";
import { monitor } from "../../lib/server/db/schema";
import { childLogger, wideEvent, type CheckWideEvent } from "../../lib/server/logger";
import { db } from "../shared/db";
import { executeCheck } from "./check";
import { initializeMaintenanceJobs, runDueMaintenanceJobs } from "./maintenance";
import { recordCheckFailure, recordCheckSuccess } from "./schedule";

const schedulerLogger = childLogger("scheduler");

let running = true;
let currentBackoffMs = WORKER_BACKOFF.INITIAL_MS;

/**
 * Claims up to BATCH_SIZE monitors that are due for checking.
 * Uses SKIP LOCKED to allow multiple workers without conflicts.
 */
async function claimDueMonitors() {
	// Atomic claim: SELECT + UPDATE in single transaction
	const claimed = await db.transaction(async (tx) => {
		// Find monitors due for check, not in backoff
		// Use NOW() instead of passing Date objects to avoid serialization issues
		const dueMonitors = await tx.execute<{ id: string }>(sql`
			SELECT id FROM monitor
			WHERE active = true
				AND next_check_at <= NOW()
				AND (check_backoff_until IS NULL OR check_backoff_until <= NOW())
			ORDER BY next_check_at ASC
			LIMIT ${WORKER_POLL_BATCH_SIZE}
			FOR UPDATE SKIP LOCKED
		`);

		if (dueMonitors.length === 0) {
			return [];
		}

		const monitorIds = dueMonitors.map((r) => r.id);

		// Update next_check_at to prevent re-claiming
		// Actual next time will be set after check completes
		await tx
			.update(monitor)
			.set({ nextCheckAt: sql`NOW() + INTERVAL '1 hour'` })
			.where(inArray(monitor.id, monitorIds));

		// Fetch full monitor data
		return tx.select().from(monitor).where(inArray(monitor.id, monitorIds));
	});

	return claimed;
}

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

// Maintenance job check counter (check every ~60 seconds)
const MAINTENANCE_CHECK_INTERVAL = 60;

/**
 * Main polling loop with adaptive backoff.
 */
async function pollLoop() {
	let maintenanceCheckCounter = 0;

	// oxlint-disable-next-line no-unmodified-loop-condition -- modified by shutdown() signal handler
	while (running) {
		try {
			const monitors = await claimDueMonitors();

			if (monitors.length > 0) {
				// Reset backoff on successful claim
				currentBackoffMs = WORKER_BACKOFF.INITIAL_MS;

				schedulerLogger.debug({ count: monitors.length }, "Claimed monitors for checking");

				// Process batch concurrently
				await Promise.all(monitors.map(processMonitor));

				// Continue immediately - there may be more work
				continue;
			}

			// No work found - apply exponential backoff
			await sleep(currentBackoffMs);
			currentBackoffMs = Math.min(
				currentBackoffMs * WORKER_BACKOFF.MULTIPLIER,
				WORKER_BACKOFF.MAX_MS,
			);

			// Check maintenance jobs periodically
			maintenanceCheckCounter++;
			if (maintenanceCheckCounter >= MAINTENANCE_CHECK_INTERVAL) {
				await runDueMaintenanceJobs();
				maintenanceCheckCounter = 0;
			}
		} catch (error) {
			schedulerLogger.error({ error }, "Poll loop error");
			await sleep(WORKER_BACKOFF.MAX_MS);
		}
	}
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
			batch_size: WORKER_POLL_BATCH_SIZE,
			backoff_initial_ms: WORKER_BACKOFF.INITIAL_MS,
			backoff_max_ms: WORKER_BACKOFF.MAX_MS,
		},
		"Starting monitor scheduler worker",
	);

	// Initialize maintenance jobs if needed
	await initializeMaintenanceJobs();

	// Start the main polling loop
	await pollLoop();

	schedulerLogger.info("Shutdown complete");
	process.exit(0);
}

start().catch((error) => {
	schedulerLogger.fatal({ error }, "Fatal error");
	process.exit(1);
});
