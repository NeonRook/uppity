import { sql, eq, inArray } from "drizzle-orm";

import {
	WORKER_POLL_BATCH_SIZE,
	WORKER_BACKOFF,
	CHECK_RETRY,
	DEAD_LETTER_THRESHOLD_HOURS,
} from "../../lib/constants/worker";
import { monitor } from "../../lib/server/db/schema";
import { createCheckWideEvent, createWorkerLogger } from "../../lib/server/logger";
import { executeCheck } from "./check";
import { db } from "../shared/db";
import { initializeMaintenanceJobs, runDueMaintenanceJobs } from "./maintenance";

const workerLogger = createWorkerLogger();

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
 * Handles check failures with exponential backoff.
 */
async function handleCheckFailure(m: typeof monitor.$inferSelect, error: unknown) {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const newRetryCount = (m.checkRetryCount ?? 0) + 1;

	if (newRetryCount >= CHECK_RETRY.MAX_ATTEMPTS) {
		// Max retries exceeded - mark as dead letter
		workerLogger.error(
			{
				monitor_id: m.id,
				monitor_name: m.name,
				retry_count: newRetryCount,
				error: errorMessage,
			},
			"Monitor exceeded max retries, entering dead letter state",
		);

		await db
			.update(monitor)
			.set({
				checkRetryCount: newRetryCount,
				checkLastError: `Dead letter: ${errorMessage}`,
				// Set far-future backoff - requires manual intervention
				checkBackoffUntil: sql`NOW() + INTERVAL '${sql.raw(String(DEAD_LETTER_THRESHOLD_HOURS))} hours'`,
				nextCheckAt: sql`NOW() + INTERVAL '${sql.raw(String(DEAD_LETTER_THRESHOLD_HOURS))} hours'`,
			})
			.where(eq(monitor.id, m.id));

		// TODO: Send alert to admin about dead letter monitor
		return;
	}

	// Calculate exponential backoff
	const backoffMs = Math.min(
		CHECK_RETRY.INITIAL_BACKOFF_MS * Math.pow(CHECK_RETRY.MULTIPLIER, newRetryCount - 1),
		CHECK_RETRY.MAX_BACKOFF_MS,
	);

	workerLogger.warn(
		{
			monitor_id: m.id,
			monitor_name: m.name,
			retry_attempt: newRetryCount,
			max_attempts: CHECK_RETRY.MAX_ATTEMPTS,
			backoff_ms: backoffMs,
			error: errorMessage,
		},
		"Monitor check failed, backing off",
	);

	await db
		.update(monitor)
		.set({
			checkRetryCount: newRetryCount,
			checkLastError: errorMessage,
			checkBackoffUntil: sql`NOW() + INTERVAL '${sql.raw(String(backoffMs))} milliseconds'`,
			nextCheckAt: sql`NOW() + INTERVAL '${sql.raw(String(backoffMs))} milliseconds'`,
		})
		.where(eq(monitor.id, m.id));
}

/**
 * Processes a single monitor check.
 */
async function processMonitor(m: typeof monitor.$inferSelect) {
	// Create wide event for this check
	const event = createCheckWideEvent(m.id);
	event.merge({
		monitor_id: m.id,
		monitor_name: m.name,
		monitor_type: m.type as "http" | "tcp" | "push",
		org_id: m.organizationId,
	});

	try {
		await executeCheck(m, db, event);

		// Success: reset retry state, schedule next check
		await db
			.update(monitor)
			.set({
				nextCheckAt: sql`NOW() + INTERVAL '${sql.raw(String(m.intervalSeconds))} seconds'`,
				checkRetryCount: 0,
				checkLastError: null,
				checkBackoffUntil: null,
			})
			.where(eq(monitor.id, m.id));
	} catch (error) {
		event.setError(error);
		await handleCheckFailure(m, error);
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

				workerLogger.debug({ count: monitors.length }, "Claimed monitors for checking");

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
			workerLogger.error({ error }, "Poll loop error");
			await sleep(WORKER_BACKOFF.MAX_MS);
		}
	}
}

// Graceful shutdown
function shutdown(signal: string): void {
	workerLogger.info({ signal }, "Received shutdown signal");
	running = false;
	interruptSleep();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start worker
async function start() {
	workerLogger.info(
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

	workerLogger.info("Shutdown complete");
	process.exit(0);
}

start().catch((error) => {
	workerLogger.fatal({ error }, "Fatal error");
	process.exit(1);
});
