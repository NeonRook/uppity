import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { CHECK_RETRY } from "../../lib/constants/worker";
import type { Db, DbExecutor } from "../../lib/server/db/index";
import { monitor, notificationEvent, type Monitor } from "../../lib/server/db/schema";
import { childLogger } from "../../lib/server/logger";
import type { NotificationType } from "../../lib/server/notifications/types";

const log = childLogger("scheduler");

function enqueue(tx: DbExecutor, m: Monitor, type: NotificationType) {
	return tx.insert(notificationEvent).values({
		id: nanoid(),
		organizationId: m.organizationId,
		monitorId: m.id,
		type,
		payload: {},
		status: "pending",
	});
}

/** Schedules the next check and ends dead letter, telling the customer checks resumed. */
export async function recordCheckSuccess(db: Db, m: Monitor): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.update(monitor)
			.set({
				nextCheckAt: sql`NOW() + INTERVAL '${sql.raw(String(m.intervalSeconds))} seconds'`,
				checkRetryCount: 0,
				checkLastError: null,
				checkBackoffUntil: null,
				deadLetteredAt: null,
			})
			.where(eq(monitor.id, m.id));

		if (m.deadLetteredAt) await enqueue(tx, m, "monitor_checks_resumed");
	});

	if (m.deadLetteredAt) {
		log.info({ event_type: "monitor_dead_letter_recovered", monitor_id: m.id }, "Checks resumed");
	}
}

/**
 * Backs off after the checker itself failed. Retries never stop: past
 * MAX_ATTEMPTS the monitor is dead-lettered, which notifies the customer and
 * the operator once, and keeps retrying at the capped backoff (ADR 0005).
 */
export async function recordCheckFailure(db: Db, m: Monitor, error: unknown): Promise<void> {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const retryCount = (m.checkRetryCount ?? 0) + 1;
	const backoffMs = Math.min(
		CHECK_RETRY.INITIAL_BACKOFF_MS * CHECK_RETRY.MULTIPLIER ** (retryCount - 1),
		CHECK_RETRY.MAX_BACKOFF_MS,
	);
	const entering = retryCount >= CHECK_RETRY.MAX_ATTEMPTS && !m.deadLetteredAt;
	const due = sql`NOW() + INTERVAL '${sql.raw(String(backoffMs))} milliseconds'`;

	await db.transaction(async (tx) => {
		await tx
			.update(monitor)
			.set({
				checkRetryCount: retryCount,
				checkLastError: errorMessage,
				checkBackoffUntil: due,
				nextCheckAt: due,
				...(entering && { deadLetteredAt: sql`NOW()` }),
			})
			.where(eq(monitor.id, m.id));

		if (entering) await enqueue(tx, m, "monitor_checks_stopped");
	});

	const fields = {
		monitor_id: m.id,
		monitor_name: m.name,
		org_id: m.organizationId,
		retry_count: retryCount,
		backoff_ms: backoffMs,
		error: errorMessage,
	};
	if (entering) {
		// Railway log alerts match on this event_type.
		log.error({ event_type: "monitor_dead_lettered", ...fields }, "Monitor dead-lettered");
	} else {
		log.warn(fields, "Monitor check failed, backing off");
	}
}
