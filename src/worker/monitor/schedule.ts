import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { RETRY_DELAY_MS, SSL_INFO_TIMEOUT_MS } from "../../lib/constants/defaults";
import { CHECK_RETRY, WORKER_POLL_BATCH_SIZE } from "../../lib/constants/worker";
import type { Db, DbExecutor } from "../../lib/server/db/index";
import { monitor, notificationEvent, type Monitor } from "../../lib/server/db/schema";
import { childLogger } from "../../lib/server/logger";
import type { NotificationType } from "../../lib/server/notifications/types";

const log = childLogger("scheduler");

/** Whole seconds as an SQL literal, rounded up. */
function seconds(ms: number) {
	return sql.raw(String(Math.ceil(ms / 1000)));
}

/**
 * Seconds a claim holds a monitor: every attempt timing out, each followed by the
 * SSL probe and the pause before the next, plus room for the writes. A check that
 * never records a result is retried when this runs out.
 */
const LEASE_SECONDS = sql`(${monitor.timeoutSeconds} + ${seconds(SSL_INFO_TIMEOUT_MS + RETRY_DELAY_MS)}) * (${monitor.retries} + 1) + 30`;

let deadLetterColumn = false;

/**
 * Whether monitor.dead_lettered_at exists. The workers can start before the web
 * tier's pre-deploy migration adds it. Until then checks run and back off as
 * usual, and dead letter is not tracked.
 */
async function tracksDeadLetter(db: DbExecutor): Promise<boolean> {
	deadLetterColumn ||=
		(
			await db.execute(sql`
				SELECT 1 FROM information_schema.columns
				WHERE table_schema = current_schema()
					AND table_name = 'monitor'
					AND column_name = 'dead_lettered_at'
			`)
		).length > 0;
	return deadLetterColumn;
}

/**
 * Claims up to WORKER_POLL_BATCH_SIZE due monitors. SKIP LOCKED lets several
 * workers poll at once. The claim is a lease on check_backoff_until, so
 * next_check_at keeps the time the check was due.
 */
export async function claimDueMonitors(db: Db): Promise<Monitor[]> {
	const columns = {
		...getTableColumns(monitor),
		deadLetteredAt: (await tracksDeadLetter(db)) ? monitor.deadLetteredAt : sql<Date | null>`NULL`,
	};

	return db.transaction(async (tx) => {
		const due = await tx.execute<{ id: string }>(sql`
			SELECT id FROM monitor
			WHERE active = true
				AND next_check_at <= NOW()
				AND (check_backoff_until IS NULL OR check_backoff_until <= NOW())
			ORDER BY next_check_at ASC
			LIMIT ${WORKER_POLL_BATCH_SIZE}
			FOR UPDATE SKIP LOCKED
		`);
		if (due.length === 0) return [];

		return tx
			.update(monitor)
			.set({ checkBackoffUntil: sql`NOW() + make_interval(secs => ${LEASE_SECONDS})` })
			.where(
				inArray(
					monitor.id,
					due.map((r) => r.id),
				),
			)
			.returning(columns);
	});
}

/**
 * Makes due every active monitor scheduled further out than this scheduler ever
 * schedules one: its interval or the backoff cap, plus a lease. A schedule from
 * another scheduler version, such as a long claim or a dead-letter window, then
 * holds a monitor for minutes rather than hours.
 */
export async function releaseOverlongSchedules(db: Db): Promise<void> {
	const released = await db
		.update(monitor)
		.set({ nextCheckAt: sql`NOW()`, checkBackoffUntil: null })
		.where(
			and(
				eq(monitor.active, true),
				sql`GREATEST(${monitor.nextCheckAt}, ${monitor.checkBackoffUntil}) > NOW() + make_interval(secs => GREATEST(${monitor.intervalSeconds}, ${seconds(CHECK_RETRY.MAX_BACKOFF_MS)}) + ${LEASE_SECONDS})`,
			),
		)
		.returning({ id: monitor.id });

	if (released.length > 0) {
		log.warn({ monitor_ids: released.map((r) => r.id) }, "Released monitors scheduled too far out");
	}
}

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
				...(m.deadLetteredAt && { deadLetteredAt: null }),
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
	const entering =
		retryCount >= CHECK_RETRY.MAX_ATTEMPTS && !m.deadLetteredAt && (await tracksDeadLetter(db));
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
