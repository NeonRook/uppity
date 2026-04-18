import { and, eq, inArray, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../../lib/server/db/schema";
import { notificationEvent } from "../../lib/server/db/schema";
import type { NotifierWideEvent, WideEventBuilder } from "../../lib/server/logger";

type Db = PostgresJsDatabase<typeof schema>;

export const CLAIM_BATCH_SIZE = 25;
export const STUCK_ROW_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Claims up to CLAIM_BATCH_SIZE events and returns their IDs. Called by the
 * LISTEN handler (where row IDs may also be passed directly) and by the
 * periodic backlog sweep.
 *
 * Reclaims rows stuck in 'processing' state older than STUCK_ROW_THRESHOLD_MS.
 */
export async function claimPendingEvents(db: Db): Promise<string[]> {
	const claimed = await db.transaction(async (tx) => {
		const cutoff = new Date(Date.now() - STUCK_ROW_THRESHOLD_MS);

		const rows = await tx
			.select({ id: notificationEvent.id })
			.from(notificationEvent)
			.where(
				or(
					eq(notificationEvent.status, "pending"),
					and(
						eq(notificationEvent.status, "processing"),
						lt(notificationEvent.claimedAt, cutoff),
					),
				),
			)
			.orderBy(notificationEvent.createdAt)
			.limit(CLAIM_BATCH_SIZE)
			.for("update", { skipLocked: true });

		if (rows.length === 0) {
			return [];
		}

		const ids = rows.map((r) => r.id);
		await tx
			.update(notificationEvent)
			.set({ status: "processing", claimedAt: new Date() })
			.where(inArray(notificationEvent.id, ids));

		return ids;
	});

	return claimed;
}

/**
 * Processes a single event. In NEO-5 this is log-only. NEO-29 replaces the
 * body with real provider dispatch.
 */
export async function processOne(
	db: Db,
	id: string,
	event?: WideEventBuilder<NotifierWideEvent>,
): Promise<void> {
	const [row] = await db
		.select()
		.from(notificationEvent)
		.where(eq(notificationEvent.id, id))
		.limit(1);

	if (!row) {
		event?.set("skip_reason", "not_found");
		return;
	}

	if (row.status !== "pending" && row.status !== "processing") {
		event?.set("skip_reason", `terminal_${row.status}`);
		return;
	}

	event?.merge({
		event_id: row.id,
		notification_event_type: row.type,
		monitor_id: row.monitorId ?? undefined,
		incident_id: row.incidentId ?? undefined,
		organization_id: row.organizationId,
		claim_latency_ms: row.claimedAt
			? row.claimedAt.getTime() - row.createdAt.getTime()
			: undefined,
	});

	// NEO-5: log-only. NEO-29 replaces this with provider dispatch.
	await db
		.update(notificationEvent)
		.set({ status: "processed", processedAt: new Date() })
		.where(eq(notificationEvent.id, id));

	event?.set("row_status", "processed");
	if (row.claimedAt) {
		event?.set("process_latency_ms", Date.now() - row.claimedAt.getTime());
	}
}

/**
 * Sweep: claim and process any pending/stuck rows. Run on startup and every
 * STUCK_ROW_THRESHOLD_MS as a safety net for dropped LISTEN connections.
 */
export async function processBacklog(
	db: Db,
	trigger: "startup" | "sweep",
	createEvent: () => WideEventBuilder<NotifierWideEvent>,
): Promise<number> {
	let total = 0;
	for (;;) {
		const ids = await claimPendingEvents(db);
		if (ids.length === 0) return total;
		for (const id of ids) {
			const event = createEvent();
			event.set("trigger_source", trigger);
			try {
				await processOne(db, id, event);
				event.setSuccess();
			} catch (err) {
				event.setError(err);
				// Don't throw — continue processing the rest of the batch
			} finally {
				event.emit("notifier");
			}
		}
		total += ids.length;
	}
}
