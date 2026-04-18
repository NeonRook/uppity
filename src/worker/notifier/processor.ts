import { and, eq, inArray, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../../lib/server/db/schema";
import type { NotificationEvent } from "../../lib/server/db/schema";
import { notificationEvent } from "../../lib/server/db/schema";
import type { NotifierWideEvent, WideEventBuilder } from "../../lib/server/logger";
import type { DispatchResult, NotificationService } from "../../lib/server/notifications/service";

type Db = PostgresJsDatabase<typeof schema>;

export const CLAIM_BATCH_SIZE = 25;
export const STUCK_ROW_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Claims up to CLAIM_BATCH_SIZE pending events (or rows stuck in 'processing'
 * older than STUCK_ROW_THRESHOLD_MS) and returns the full claimed rows. Called
 * by the periodic backlog sweep; the LISTEN handler processes pg_notify
 * payloads directly via processOne rather than claiming in batches.
 */
export async function claimPendingEvents(db: Db): Promise<NotificationEvent[]> {
	return db.transaction(async (tx) => {
		const cutoff = new Date(Date.now() - STUCK_ROW_THRESHOLD_MS);

		const rows = await tx
			.select({ id: notificationEvent.id })
			.from(notificationEvent)
			.where(
				or(
					eq(notificationEvent.status, "pending"),
					and(eq(notificationEvent.status, "processing"), lt(notificationEvent.claimedAt, cutoff)),
				),
			)
			.orderBy(notificationEvent.createdAt)
			.limit(CLAIM_BATCH_SIZE)
			.for("update", { skipLocked: true });

		if (rows.length === 0) return [];

		const ids = rows.map((r) => r.id);
		return await tx
			.update(notificationEvent)
			.set({ status: "processing", claimedAt: new Date() })
			.where(inArray(notificationEvent.id, ids))
			.returning();
	});
}

/**
 * Atomically claims and processes a single event. Uses a conditional UPDATE
 * with RETURNING to eliminate the SELECT→check→UPDATE race where two workers
 * could both read a pending row and both proceed to dispatch.
 *
 * If RETURNING yields 0 rows, another worker claimed the event first (or it
 * reached a terminal state); we return silently. If RETURNING yields 1 row,
 * we own it and proceed.
 */
export async function processOne(
	db: Db,
	id: string,
	event: WideEventBuilder<NotifierWideEvent> | undefined,
	service: NotificationService,
): Promise<void> {
	const [row] = await db
		.update(notificationEvent)
		.set({ status: "processing", claimedAt: new Date() })
		.where(and(eq(notificationEvent.id, id), eq(notificationEvent.status, "pending")))
		.returning();

	if (!row) {
		event?.set("skip_reason", "not_claimed");
		return;
	}

	await dispatchClaimed(db, row, service, event);
}

/**
 * Dispatch and write terminal status for an already-claimed row. Shared by
 * both the LISTEN path (via processOne) and the sweep path (via processBacklog)
 * so that sweep rows are not re-claimed after claimPendingEvents already
 * transitioned them to 'processing'.
 *
 * The terminal UPDATE is guarded on the claim's claimedAt: if the sweep
 * reclaimed this row during our dispatch (>= STUCK_ROW_THRESHOLD_MS of lag),
 * claimedAt has moved and the UPDATE matches zero rows. We emit
 * skip_reason="claim_lost" and return without overwriting the new owner's claim.
 */
async function dispatchClaimed(
	db: Db,
	row: NotificationEvent,
	service: NotificationService,
	event?: WideEventBuilder<NotifierWideEvent>,
): Promise<void> {
	event?.merge({
		event_id: row.id,
		notification_event_type: row.type,
		monitor_id: row.monitorId ?? undefined,
		incident_id: row.incidentId ?? undefined,
		organization_id: row.organizationId,
		claim_latency_ms: row.claimedAt ? row.claimedAt.getTime() - row.createdAt.getTime() : undefined,
	});

	let result: DispatchResult;
	try {
		result = await service.dispatchEvent(row);
	} catch (err) {
		result = {
			status: "failed",
			errorMessage: err instanceof Error ? err.message : String(err),
		};
	}

	const errorMessage = result.status === "sent" ? null : result.errorMessage;

	// Guard the terminal write on our claim. If claimedAt has moved, the sweep
	// reclaimed this row during our dispatch — another worker owns it now and
	// will write its own terminal. Don't overwrite.
	const updated = await db
		.update(notificationEvent)
		.set({ status: result.status, processedAt: new Date(), errorMessage })
		.where(and(eq(notificationEvent.id, row.id), eq(notificationEvent.claimedAt, row.claimedAt!)))
		.returning({ id: notificationEvent.id });

	if (updated.length === 0) {
		event?.set("skip_reason", "claim_lost");
		return;
	}

	event?.set("row_status", result.status);
	if (row.claimedAt) {
		event?.set("process_latency_ms", Date.now() - row.claimedAt.getTime());
	}
}

/**
 * Sweep: claim and process any pending/stuck rows. Run on startup and every
 * STUCK_ROW_THRESHOLD_MS as a safety net for dropped LISTEN connections.
 *
 * Rows are dispatched directly via dispatchClaimed — not re-claimed through
 * processOne — because claimPendingEvents already transitioned them to
 * 'processing'.
 */
export async function processBacklog(
	db: Db,
	trigger: "startup" | "sweep",
	createEvent: () => WideEventBuilder<NotifierWideEvent>,
	service: NotificationService,
): Promise<number> {
	let total = 0;
	for (;;) {
		const rows = await claimPendingEvents(db);
		if (rows.length === 0) return total;
		for (const row of rows) {
			const event = createEvent();
			event.set("trigger_source", trigger);
			try {
				await dispatchClaimed(db, row, service, event);
				event.setSuccess();
			} catch (err) {
				event.setError(err);
				// Don't throw — continue processing the rest of the batch
			} finally {
				event.emit("notifier");
			}
		}
		total += rows.length;
	}
}
