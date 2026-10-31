import { setTimeout as sleep } from "node:timers/promises";

import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import {
	DEFAULT_TIMEOUT_SECONDS,
	DEFAULT_INTERVAL_SECONDS,
	DEFAULT_PUSH_GRACE_PERIOD_SECONDS,
	DEGRADED_RESPONSE_TIME_MS,
	RETRY_DELAY_MS,
	DEFAULT_RETRIES,
} from "../../lib/constants/defaults";
import { MAX_RETRIES, MAX_TIMEOUT_SECONDS } from "../../lib/constants/monitor";
import type { Db } from "../../lib/server/db/index";
import { monitorCheck, type Monitor } from "../../lib/server/db/schema";
import type { CheckWideEvent, WideEventBuilder } from "../../lib/server/logger";
import { probeTcp } from "../../lib/server/tcp";
import { performHttpCheck } from "./http";
import { processResults } from "./processor";

/** One check's outcome, as it is stored in monitor_check. */
export interface CheckResult {
	status: "up" | "down" | "degraded";
	statusCode?: number;
	responseTimeMs: number;
	errorMessage?: string;
	dnsMs?: number;
	connectMs?: number;
	tlsMs?: number;
	firstByteMs?: number;
	redirectCount?: number;
	sslExpiresAt?: Date;
	sslIssuer?: string;
}

async function performTcpCheck(m: Monitor): Promise<CheckResult> {
	if (!m.hostname || !m.port) {
		return { status: "down", responseTimeMs: 0, errorMessage: "No hostname or port configured" };
	}

	const timeoutSeconds = Math.min(m.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);
	const startTime = performance.now();
	const result = await probeTcp(m.hostname, m.port, timeoutSeconds * 1000);
	const responseTimeMs = Math.round(performance.now() - startTime);

	if (!result.ok) return { status: "down", responseTimeMs, errorMessage: result.error };

	return {
		status: responseTimeMs > DEGRADED_RESPONSE_TIME_MS ? "degraded" : "up",
		responseTimeMs,
	};
}

/**
 * Heartbeats are a push monitor's up results, written by the webhook. The check
 * only records their absence, as a down result once the last one is overdue.
 */
async function recordPushCheck(m: Monitor, db: Db): Promise<CheckResult | null> {
	// Stamped before the lookup, so a heartbeat landing meanwhile is the newer result.
	const checkedAt = new Date();
	const result = await findMissedHeartbeat(m, db);
	if (result) await insertResult(db, m.id, result, checkedAt);
	return result;
}

async function findMissedHeartbeat(m: Monitor, db: Db): Promise<CheckResult | null> {
	const gracePeriodSeconds = m.pushGracePeriodSeconds || DEFAULT_PUSH_GRACE_PERIOD_SECONDS;
	const expectedInterval = m.intervalSeconds || DEFAULT_INTERVAL_SECONDS;
	const allowedMs = (expectedInterval + gracePeriodSeconds) * 1000;

	const [lastHeartbeat] = await db
		.select({ checkedAt: monitorCheck.checkedAt })
		.from(monitorCheck)
		.where(and(eq(monitorCheck.monitorId, m.id), eq(monitorCheck.status, "up")))
		.orderBy(desc(monitorCheck.checkedAt))
		.limit(1);

	if (!lastHeartbeat) {
		const monitorAge = Date.now() - new Date(m.createdAt).getTime();
		if (monitorAge < allowedMs) return null;
		return { status: "down", responseTimeMs: 0, errorMessage: "No heartbeat received" };
	}

	const lastPingAge = Date.now() - lastHeartbeat.checkedAt.getTime();
	if (lastPingAge <= allowedMs) return null;

	return {
		status: "down",
		responseTimeMs: 0,
		errorMessage: `No heartbeat for ${Math.floor(lastPingAge / 60000)} minutes`,
	};
}

async function performProbe(m: Monitor): Promise<CheckResult> {
	switch (m.type) {
		case "http":
			return performHttpCheck(m);
		case "tcp":
			return performTcpCheck(m);
		default:
			return { status: "down", responseTimeMs: 0, errorMessage: "Unknown monitor type" };
	}
}

async function performProbeWithRetries(m: Monitor): Promise<CheckResult> {
	const retries = Math.min(m.retries ?? DEFAULT_RETRIES, MAX_RETRIES);
	let result = await performProbe(m);

	for (let attempt = 0; attempt < retries && result.status === "down"; attempt++) {
		await sleep(RETRY_DELAY_MS);
		result = await performProbe(m);
	}

	return result;
}

/** Writes a result for the processor to interpret. */
export async function insertResult(
	db: Db,
	monitorId: string,
	result: CheckResult,
	checkedAt = new Date(),
): Promise<void> {
	await db.insert(monitorCheck).values({ id: nanoid(), monitorId, checkedAt, ...result });
}

/**
 * Checks a monitor, records the result, and processes every result the monitor has
 * waiting, including heartbeats the push webhook wrote since the last check.
 */
export async function executeCheck(
	m: Monitor,
	db: Db,
	event?: WideEventBuilder<CheckWideEvent>,
): Promise<void> {
	let result: CheckResult | null;
	if (m.type === "push") {
		result = await recordPushCheck(m, db);
	} else {
		result = await performProbeWithRetries(m);
		await insertResult(db, m.id, result);
	}
	await processResults(db, m.id, event);

	// A down target is a result, not a worker failure. The processor skips a row the
	// sweep claimed or a newer result superseded, so the outcome is recorded here too.
	if (result) event?.merge({ check_status: result.status, check_error: result.errorMessage });
	event?.setSuccess();
}
