import { and, count, desc, eq, isNotNull, min, sql } from "drizzle-orm";

import type { DbExecutor } from "./db/index";
import { monitor } from "./db/schema";

/**
 * How long an active monitor may sit past due before it reads as not checked. A
 * running worker claims a due monitor within seconds, and a claim pushes
 * check_backoff_until past its own worst case, so only a worker that is down,
 * crash-looping, or cut off from the database leaves a monitor this late.
 */
export const OVERDUE_AFTER_SECONDS = 300;

/** When the scheduler will next pick the monitor up: its schedule or its lease, whichever is later. */
const dueAt = sql<Date | null>`GREATEST(${monitor.nextCheckAt}, ${monitor.checkBackoffUntil})`;

/**
 * An active monitor no worker has checked on time. Derived at read time, as a
 * worker that is down cannot record that it stopped.
 */
export const checksOverdue = sql<boolean>`(${monitor.active} AND ${dueAt} < NOW() - make_interval(secs => ${OVERDUE_AFTER_SECONDS}))`;

/** Whether an active monitor's recorded status is stale: dead-lettered, or overdue. */
export const checksStopped = sql<boolean>`(${monitor.active} AND (${monitor.deadLetteredAt} IS NOT NULL OR ${checksOverdue}))`;

/** Overdue monitors across every organization, for the operator alert. */
export async function overdueChecks(
	db: DbExecutor,
): Promise<{ overdue: number; oldestDueAt: Date | null }> {
	const [row] = await db
		.select({ overdue: count(), oldestDueAt: min(dueAt).mapWith(monitor.nextCheckAt) })
		.from(monitor)
		.where(checksOverdue);
	return row;
}

/**
 * Active dead-lettered monitors across every organization, newest first and at
 * most `limit`, for the operator alert. `total` counts all of them.
 */
export function deadLetteredMonitors(db: DbExecutor, limit: number) {
	return db
		.select({
			id: monitor.id,
			name: monitor.name,
			organizationId: monitor.organizationId,
			lastError: monitor.checkLastError,
			deadLetteredAt: monitor.deadLetteredAt,
			total: sql<number>`count(*) OVER ()`.mapWith(Number),
		})
		.from(monitor)
		.where(and(isNotNull(monitor.deadLetteredAt), eq(monitor.active, true)))
		.orderBy(desc(monitor.deadLetteredAt), desc(monitor.id))
		.limit(limit);
}
