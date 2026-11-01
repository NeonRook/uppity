import { and, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";

import type { Db } from "../../lib/server/db/index";
import type { NotificationEvent } from "../../lib/server/db/schema";
import { notificationEvent } from "../../lib/server/db/schema";
import type { NotifierWideEvent, WideEventBuilder } from "../../lib/server/logger";
import {
	CHANNEL_CONFIRMATION_EVENT,
	CONFIRMATION_QUEUED,
	CONFIRMATION_SENDING,
	queuedRetry,
	RETRY_QUEUED,
	RETRY_SENDING,
} from "../../lib/server/notifications/events";
import type { NotificationService } from "../../lib/server/notifications/service";

const SWEEP_WORKERS = 25;
export const STUCK_ROW_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * The wait before each further attempt at a failed delivery. An event gets one attempt more
 * than there are entries, so these span a mail server outage of about an hour.
 */
export const ALERT_RETRY_DELAYS_MS = [1, 2, 5, 10, 20, 30].map((minutes) => minutes * 60_000);

/** The statuses a sweep works through. */
export interface Lane {
	queued: string;
	claimed: string;
	/** Rows a sweep sends at once. A hanging send takes up one worker and no more. */
	workers: number;
	/** Narrows the queued rows, for a lane whose rows wait for a time. */
	due?: SQL;
}

export const ALERTS: Lane = { queued: "pending", claimed: "processing", workers: SWEEP_WORKERS };

/**
 * Swept apart from alerts, so a hanging mail server cannot hold an alert behind a confirmation
 * email. A notifier without this lane ignores these statuses, so during a deploy a confirmation
 * waits for the new one.
 */
export const CONFIRMATIONS: Lane = {
	queued: CONFIRMATION_QUEUED,
	claimed: CONFIRMATION_SENDING,
	workers: 1,
};

/**
 * Swept apart from new alerts, so an outage's backlog of retries cannot hold one up. A notifier
 * without this lane ignores these statuses, so during a deploy a retry waits for the new one.
 */
export const RETRIES: Lane = {
	queued: RETRY_QUEUED,
	claimed: RETRY_SENDING,
	workers: SWEEP_WORKERS,
	due: sql`(${notificationEvent.payload}->'retry'->>'nextAt')::timestamptz <= now()`,
};

/**
 * Claims the oldest queued event (or claimed row older than STUCK_ROW_THRESHOLD_MS) and returns
 * the claimed row. One at a time: a row waiting in a claimed batch would go stale behind slow
 * sends, and a later sweep would deliver it twice. Called by the periodic backlog sweep; the
 * LISTEN handler processes pg_notify payloads directly via processOne.
 */
export async function claimPendingEvent(
	db: Db,
	lane: Lane = ALERTS,
): Promise<NotificationEvent | undefined> {
	return db.transaction(async (tx) => {
		const cutoff = new Date(Date.now() - STUCK_ROW_THRESHOLD_MS);

		const [row] = await tx
			.select({ id: notificationEvent.id })
			.from(notificationEvent)
			.where(
				or(
					and(eq(notificationEvent.status, lane.queued), lane.due),
					and(eq(notificationEvent.status, lane.claimed), lt(notificationEvent.claimedAt, cutoff)),
				),
			)
			.orderBy(notificationEvent.createdAt)
			.limit(1)
			.for("update", { skipLocked: true });

		if (!row) return undefined;

		const [claimed] = await tx
			.update(notificationEvent)
			.set({ status: lane.claimed, claimedAt: new Date() })
			.where(eq(notificationEvent.id, row.id))
			.returning();
		return claimed;
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
		.set({
			status: sql`case ${notificationEvent.status} when ${CONFIRMATIONS.queued} then ${CONFIRMATIONS.claimed} else ${ALERTS.claimed} end`,
			claimedAt: new Date(),
		})
		.where(
			and(
				eq(notificationEvent.id, id),
				inArray(notificationEvent.status, [ALERTS.queued, CONFIRMATIONS.queued]),
			),
		)
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
 * so that sweep rows are not re-claimed after claimPendingEvent already
 * transitioned them to 'processing'.
 *
 * A delivery that may yet pass goes to the retry lane until ALERT_RETRY_DELAYS_MS runs out.
 * A failure can be ambiguous, such as a timeout after the server took the message, so a retry
 * can deliver twice. That beats losing the alert.
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

	// A throw, such as a lost database connection, leaves the row claimed. The
	// sweep retries it once the claim is stale, so the alert is late, not lost.
	const result = await service.dispatchEvent(row);

	const errorMessage = result.status === "sent" ? null : result.errorMessage;
	const owes = "retry" in result ? result.retry : undefined;
	const attempt = queuedRetry(row.payload)?.attempt ?? 0;
	const delay = owes && ALERT_RETRY_DELAYS_MS.at(attempt);

	// Guard the terminal write on our claim. If claimedAt has moved, the sweep
	// reclaimed this row during our dispatch — another worker owns it now and
	// will write its own terminal. Don't overwrite.
	const updated = await db
		.update(notificationEvent)
		.set(
			delay
				? {
						status: RETRIES.queued,
						errorMessage,
						payload: {
							...(row.payload as object),
							retry: {
								...owes,
								attempt: attempt + 1,
								nextAt: new Date(Date.now() + delay).toISOString(),
							},
						},
					}
				: {
						status: result.status,
						processedAt: new Date(),
						errorMessage,
						// This table keeps its rows, and a confirmation's payload names two people.
						...(row.type === CHANNEL_CONFIRMATION_EVENT ? { payload: {} } : {}),
						...(owes ? { payload: { ...(row.payload as object), retriesExhausted: true } } : {}),
					},
		)
		.where(and(eq(notificationEvent.id, row.id), eq(notificationEvent.claimedAt, row.claimedAt!)))
		.returning({ id: notificationEvent.id });

	if (updated.length === 0) {
		event?.set("skip_reason", "claim_lost");
		return;
	}

	event?.set("row_status", delay ? RETRIES.queued : result.status);
	if (row.claimedAt) {
		event?.set("process_latency_ms", Date.now() - row.claimedAt.getTime());
	}
}

/**
 * Sweep: claim and process any pending/stuck rows. Run on startup and every
 * STUCK_ROW_THRESHOLD_MS as a safety net for dropped LISTEN connections.
 *
 * Rows are dispatched directly via dispatchClaimed — not re-claimed through
 * processOne — because claimPendingEvent already transitioned them to
 * 'processing'.
 */
export async function processBacklog(
	db: Db,
	trigger: "startup" | "sweep",
	createEvent: () => WideEventBuilder<NotifierWideEvent>,
	service: NotificationService,
	lane: Lane = ALERTS,
): Promise<number> {
	let total = 0;
	const work = async () => {
		for (;;) {
			const row = await claimPendingEvent(db, lane);
			if (!row) return;
			total++;
			const event = createEvent();
			event.set("trigger_source", trigger);
			try {
				await dispatchClaimed(db, row, service, event);
				event.setSuccess();
			} catch (err) {
				event.setError(err);
				// Don't throw — continue processing the rest of the backlog
			} finally {
				event.emit("notifier");
			}
		}
	};
	await Promise.all(Array.from({ length: lane.workers }, work));
	return total;
}
