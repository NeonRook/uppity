/**
 * The result processor: the one place a check result becomes monitor status,
 * auto-incidents and notification events (ADR 0007). It reads monitor_check rows,
 * whoever wrote them, so a probed result and a push heartbeat get the same rules.
 *
 * Each monitor's unprocessed rows are interpreted in order under a per-monitor
 * lock, in the transaction that marks them processed. Several processors can then
 * see the same row, from LISTEN, the sweep or the check that wrote it, and only
 * the first interprets it.
 */
import { and, asc, between, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import {
	DEFAULT_INCIDENT_STATUS,
	DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS,
	FLAP_SETTLE_SECONDS,
	FLAP_THRESHOLD,
	FLAP_WINDOW_SECONDS,
	SSL_WARNING_COOLDOWN_HOURS,
} from "../../lib/constants/defaults";
import type { Db, DbExecutor } from "../../lib/server/db/index";
import {
	incident,
	incidentMonitor,
	incidentUpdate,
	monitor,
	monitorCheck,
	monitorStatus,
	notificationEvent,
	type Monitor,
} from "../../lib/server/db/schema";
import { activeFlap, outageAlerted } from "../../lib/server/flap";
import { incidentActive } from "../../lib/server/incident-state";
import type { CheckWideEvent, WideEventBuilder } from "../../lib/server/logger";
import type {
	MonitorFlappingEventPayload,
	MonitorStatusEventPayload,
	SslExpiryEventPayload,
} from "../../lib/server/notifications/events";
import type { NotificationType } from "../../lib/server/notifications/types";
import { findActiveWindow } from "../../lib/server/services/maintenance-window.service";

type MonitorCheck = typeof monitorCheck.$inferSelect;
type Status = "up" | "down" | "degraded";

/** Whether the monitor's alerted status changes in the window reach the flapping limit. */
async function reachesFlapLimit(tx: DbExecutor, monitorId: string, at: Date): Promise<boolean> {
	if (FLAP_THRESHOLD < 2) return false;
	const [{ changes }] = await tx
		.select({ changes: count() })
		.from(notificationEvent)
		.where(
			and(
				eq(notificationEvent.monitorId, monitorId),
				inArray(notificationEvent.type, ["monitor_down", "monitor_up"]),
				gte(notificationEvent.createdAt, new Date(at.getTime() - FLAP_WINDOW_SECONDS * 1000)),
			),
		);
	return changes + 1 >= FLAP_THRESHOLD;
}

/** Whether a check in the settle time up to `at` was down. */
async function wentDownRecently(tx: DbExecutor, monitorId: string, at: Date): Promise<boolean> {
	const [down] = await tx
		.select({ id: monitorCheck.id })
		.from(monitorCheck)
		.where(
			and(
				eq(monitorCheck.monitorId, monitorId),
				eq(monitorCheck.status, "down"),
				between(monitorCheck.checkedAt, new Date(at.getTime() - FLAP_SETTLE_SECONDS * 1000), at),
			),
		)
		.limit(1);
	return down !== undefined;
}

/** The monitor's open incident, the automatic one if a manual one is open too. */
async function activeIncident(tx: DbExecutor, monitorId: string) {
	const [row] = await tx
		.select({ id: incident.id, status: incident.status, isAutoCreated: incident.isAutoCreated })
		.from(incident)
		.innerJoin(incidentMonitor, eq(incident.id, incidentMonitor.incidentId))
		.where(and(eq(incidentMonitor.monitorId, monitorId), incidentActive))
		.orderBy(desc(incident.isAutoCreated))
		.limit(1);
	return row;
}

function postUpdate(tx: DbExecutor, incidentId: string, status: string, message: string) {
	return tx
		.insert(incidentUpdate)
		.values({ id: nanoid(), incidentId, status, message, createdAt: new Date() });
}

async function interpret(
	tx: DbExecutor,
	m: Monitor,
	row: MonitorCheck,
	event?: WideEventBuilder<CheckWideEvent>,
): Promise<void> {
	const result = { ...row, status: row.status as Status };

	const [currentStatus] = await tx
		.select()
		.from(monitorStatus)
		.where(eq(monitorStatus.monitorId, m.id))
		.limit(1);

	// A row older than the last one interpreted arrived late, such as a push check
	// that found no heartbeat while one was being recorded. The newer result stands.
	if (currentStatus?.lastCheckAt && result.checkedAt < currentStatus.lastCheckAt) return;

	const previousStatus = currentStatus?.status;
	const previousFailures = currentStatus?.consecutiveFailures ?? 0;
	const consecutiveFailures = result.status === "down" ? previousFailures + 1 : 0;

	const statusChanged = previousStatus !== result.status;

	const enqueue = async (
		type: NotificationType,
		payload: MonitorStatusEventPayload | SslExpiryEventPayload | MonitorFlappingEventPayload,
	) => {
		const id = nanoid();
		await tx.insert(notificationEvent).values({
			id,
			organizationId: m.organizationId,
			monitorId: m.id,
			type,
			payload,
			status: "pending",
			// The transaction's time is the same for every result in a batch, and activeFlap reads
			// this order.
			createdAt: sql`clock_timestamp()`,
		});
		event?.merge({
			notification_event_enqueued: true,
			notification_event_id: id,
			notification_event_type: type,
		});
	};

	event?.merge({
		check_status: result.status,
		response_time_ms: result.responseTimeMs ?? undefined,
		status_code: result.statusCode ?? undefined,
		check_error: result.errorMessage ?? undefined,
		status_changed: statusChanged,
		previous_status: previousStatus,
		consecutive_failures: consecutiveFailures,
	});

	// Certificate hygiene is independent of status-change alerting, so the
	// maintenance gate below does not apply to it.
	if (result.sslExpiresAt && m.sslCheckEnabled) {
		const daysUntilExpiry = Math.floor(
			(result.sslExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
		);
		const threshold = m.sslExpiryThresholdDays || DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS;

		event?.merge({
			ssl_expires_at: result.sslExpiresAt,
			ssl_days_remaining: daysUntilExpiry,
		});

		if (daysUntilExpiry <= threshold && daysUntilExpiry > 0) {
			event?.set("ssl_expiry_warning", true);

			// Skip enqueueing if a warning was already enqueued for this monitor inside the
			// cooldown window. Hits the (monitorId, type, createdAt) index on notification_event.
			const cooldownStart = new Date(Date.now() - SSL_WARNING_COOLDOWN_HOURS * 60 * 60 * 1000);
			const [recentWarning] = await tx
				.select({ id: notificationEvent.id })
				.from(notificationEvent)
				.where(
					and(
						eq(notificationEvent.monitorId, m.id),
						eq(notificationEvent.type, "ssl_expiry_warning"),
						gte(notificationEvent.createdAt, cooldownStart),
					),
				)
				.limit(1);

			if (!recentWarning) {
				await enqueue("ssl_expiry_warning", {
					daysRemaining: daysUntilExpiry,
					sslExpiresAt: result.sslExpiresAt.toISOString(),
					sslIssuer: result.sslIssuer ?? undefined,
				});
			}
		}
	}

	// During an active maintenance window, monitor_status stays frozen and no
	// status-change notification or auto-incident fires. The first check after the
	// window then compares against the state from before it.
	const activeWindow = await findActiveWindow(tx, m.id, result.checkedAt);
	if (activeWindow) {
		event?.merge({
			maintenance_active: true,
			maintenance_window_id: activeWindow.id,
			maintenance_window_name: activeWindow.name,
		});
		return;
	}

	await tx
		.update(monitorStatus)
		.set({
			status: result.status,
			lastCheckAt: result.checkedAt,
			lastStatusChange: statusChanged ? result.checkedAt : currentStatus?.lastStatusChange,
			consecutiveFailures,
			updatedAt: new Date(),
		})
		.where(eq(monitorStatus.monitorId, m.id));

	// An outage alerts once, on the check that reaches the threshold. It recovers on the first up
	// check, however many degraded checks came between, and that alerts only if the outage did.
	const reachesThreshold = consecutiveFailures >= m.alertAfterFailures;
	const crossesThreshold =
		result.status === "down" && reachesThreshold && previousFailures < m.alertAfterFailures;
	const unchangedForMs = statusChanged
		? 0
		: result.checkedAt.getTime() - (currentStatus?.lastStatusChange?.getTime() ?? Infinity);
	const steady = unchangedForMs >= FLAP_SETTLE_SECONDS * 1000;

	// A flapping monitor keeps recording every status but holds its alerts until it stays down for
	// the settle time, or goes that long without a down check, and then alerts its status. Up and
	// degraded count as one here, so jitter between them ends the hold. A monitor that stops
	// bouncing and stays down alerts within the settle time plus one check interval of its first
	// failure, or at alertAfterFailures if that comes later.
	const flap = await activeFlap(tx, m.id);
	const inOutage =
		(result.status !== "up" || previousStatus !== "up") && (await outageAlerted(tx, m.id));
	const settled =
		flap !== undefined &&
		(result.status === "down"
			? steady && reachesThreshold
			: previousStatus !== "down" && !(await wentDownRecently(tx, m.id, result.checkedAt)));
	const startsFlapping =
		!flap && crossesThreshold && !steady && (await reachesFlapLimit(tx, m.id, result.checkedAt));

	const alertsDown = result.status === "down" && (settled || crossesThreshold);
	const alertsUp = result.status === "up" && (settled || inOutage);
	const alertsDegraded =
		result.status === "degraded" && (settled || (statusChanged && previousStatus !== "unknown"));

	const enqueueFlapping = () =>
		enqueue("monitor_flapping", {
			settleSeconds: FLAP_SETTLE_SECONDS,
			reminderSeconds: FLAP_WINDOW_SECONDS,
		});

	const openIncident = async (title: string, message: string) => {
		const incidentId = nanoid();
		await tx.insert(incident).values({
			id: incidentId,
			organizationId: m.organizationId,
			title,
			status: DEFAULT_INCIDENT_STATUS,
			impact: "major",
			isAutoCreated: true,
			startedAt: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await tx.insert(incidentMonitor).values({ incidentId, monitorId: m.id });
		await postUpdate(tx, incidentId, DEFAULT_INCIDENT_STATUS, message);
		event?.merge({ incident_created: true, incident_id: incidentId });
	};

	const resolveAutoIncident = async (message: string) => {
		// Manual incidents (isAutoCreated=false) are only resolved by humans.
		const open = await activeIncident(tx, m.id);
		if (!open?.isAutoCreated) return;

		await tx
			.update(incident)
			.set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
			.where(eq(incident.id, open.id));
		await postUpdate(tx, open.id, "resolved", message);
		event?.merge({ incident_resolved: true, incident_id: open.id });
	};

	if (startsFlapping) {
		event?.set("flapping", true);
		await enqueueFlapping();

		const message = "Monitor keeps going down and recovering.";
		const open = await activeIncident(tx, m.id);
		if (!open) await openIncident(`${m.name} is flapping`, message);
		else if (open.isAutoCreated) await postUpdate(tx, open.id, open.status, message);
	} else if (flap && !settled) {
		event?.set("flapping", true);
		const sinceNotifiedMs = result.checkedAt.getTime() - flap.notifiedAt.getTime();
		if (sinceNotifiedMs >= FLAP_WINDOW_SECONDS * 1000) await enqueueFlapping();
	} else if (alertsDown) {
		await enqueue("monitor_down", {
			previousStatus: previousStatus as Status | "unknown",
			newStatus: "down",
			consecutiveFailures,
			errorMessage: result.errorMessage ?? undefined,
			checkId: result.id,
		});

		const open = await activeIncident(tx, m.id);
		if (!open) {
			// Status pages and subscribers read this, and check errors quote hostnames and ports.
			await openIncident(`${m.name} is down`, "Monitor is not responding.");
		} else if (flap && open.isAutoCreated) {
			await postUpdate(tx, open.id, open.status, "Monitor stopped recovering and is down.");
		}
	} else if (alertsUp) {
		await enqueue("monitor_up", {
			previousStatus: previousStatus === "degraded" ? "degraded" : "down",
			newStatus: "up",
			consecutiveFailures,
			checkId: result.id,
		});

		await resolveAutoIncident("Monitor has recovered automatically.");
	} else if (result.status === "degraded") {
		if (alertsDegraded) {
			await enqueue("monitor_degraded", {
				previousStatus: previousStatus as Status | "unknown",
				newStatus: "degraded",
				consecutiveFailures,
				checkId: result.id,
			});
		}
		// A monitor that stays degraded is responding, so an incident saying it is down has ended.
		if (settled || (steady && inOutage)) {
			await resolveAutoIncident("Monitor is responding again, with degraded performance.");
		}
	}
}

/** Interprets every unprocessed result of one monitor, oldest first. Returns how many. */
export function processResults(
	db: Db,
	monitorId: string,
	event?: WideEventBuilder<CheckWideEvent>,
): Promise<number> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${monitorId}))`);

		const rows = await tx
			.select()
			.from(monitorCheck)
			.where(and(eq(monitorCheck.monitorId, monitorId), isNull(monitorCheck.processedAt)))
			.orderBy(asc(monitorCheck.checkedAt), asc(monitorCheck.id));
		if (rows.length === 0) return 0;

		const [m] = await tx.select().from(monitor).where(eq(monitor.id, monitorId));
		for (const row of rows) await interpret(tx, m, row, event);

		await tx
			.update(monitorCheck)
			.set({ processedAt: sql`NOW()` })
			.where(
				inArray(
					monitorCheck.id,
					rows.map((r) => r.id),
				),
			);
		return rows.length;
	});
}

/** Monitors with results no processor has picked up, such as ones a missed notification left. */
export async function pendingMonitorIds(db: Db): Promise<string[]> {
	const rows = await db
		.selectDistinct({ monitorId: monitorCheck.monitorId })
		.from(monitorCheck)
		.where(isNull(monitorCheck.processedAt));
	return rows.map((r) => r.monitorId);
}
