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
import { and, asc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import {
	DEFAULT_INCIDENT_STATUS,
	DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS,
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
import type { CheckWideEvent, WideEventBuilder } from "../../lib/server/logger";
import type {
	MonitorStatusEventPayload,
	SslExpiryEventPayload,
} from "../../lib/server/notifications/events";
import type { NotificationType } from "../../lib/server/notifications/types";
import { findActiveWindow } from "../../lib/server/services/maintenance-window.service";

type MonitorCheck = typeof monitorCheck.$inferSelect;
type Status = "up" | "down" | "degraded";

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
	// An outage alerts once, on the check that reaches the threshold, and its
	// recovery alerts only if the outage did.
	const alertsDown =
		result.status === "down" &&
		consecutiveFailures >= m.alertAfterFailures &&
		previousFailures < m.alertAfterFailures;
	const alertsUp =
		result.status === "up" && previousStatus === "down" && previousFailures >= m.alertAfterFailures;

	const enqueue = async (
		type: NotificationType,
		payload: MonitorStatusEventPayload | SslExpiryEventPayload,
	) => {
		const id = nanoid();
		await tx.insert(notificationEvent).values({
			id,
			organizationId: m.organizationId,
			monitorId: m.id,
			type,
			payload,
			status: "pending",
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

	if (alertsDown) {
		await enqueue("monitor_down", {
			previousStatus: previousStatus as Status | "unknown",
			newStatus: "down",
			consecutiveFailures,
			errorMessage: result.errorMessage ?? undefined,
			checkId: result.id,
		});

		const [existingIncident] = await tx
			.select({ id: incident.id })
			.from(incident)
			.innerJoin(incidentMonitor, eq(incident.id, incidentMonitor.incidentId))
			.where(and(eq(incidentMonitor.monitorId, m.id), ne(incident.status, "resolved")))
			.limit(1);

		if (!existingIncident) {
			const incidentId = nanoid();
			await tx.insert(incident).values({
				id: incidentId,
				organizationId: m.organizationId,
				title: `${m.name} is down`,
				status: DEFAULT_INCIDENT_STATUS,
				impact: "major",
				isAutoCreated: true,
				startedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await tx.insert(incidentMonitor).values({ incidentId, monitorId: m.id });

			await tx.insert(incidentUpdate).values({
				id: nanoid(),
				incidentId,
				status: DEFAULT_INCIDENT_STATUS,
				message: result.errorMessage || "Monitor is not responding.",
				createdAt: new Date(),
			});

			event?.merge({ incident_created: true, incident_id: incidentId });
		}
	} else if (alertsUp) {
		await enqueue("monitor_up", {
			previousStatus: "down",
			newStatus: "up",
			consecutiveFailures,
			checkId: result.id,
		});

		// Manual incidents (isAutoCreated=false) are only resolved by humans.
		const [existingIncident] = await tx
			.select({ id: incident.id })
			.from(incident)
			.innerJoin(incidentMonitor, eq(incident.id, incidentMonitor.incidentId))
			.where(
				and(
					eq(incidentMonitor.monitorId, m.id),
					eq(incident.isAutoCreated, true),
					ne(incident.status, "resolved"),
				),
			)
			.limit(1);

		if (existingIncident) {
			await tx
				.update(incident)
				.set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
				.where(eq(incident.id, existingIncident.id));

			await tx.insert(incidentUpdate).values({
				id: nanoid(),
				incidentId: existingIncident.id,
				status: "resolved",
				message: "Monitor has recovered automatically.",
				createdAt: new Date(),
			});

			event?.merge({ incident_resolved: true, incident_id: existingIncident.id });
		}
	} else if (statusChanged && previousStatus !== "unknown" && result.status === "degraded") {
		await enqueue("monitor_degraded", {
			previousStatus: previousStatus as Status | "unknown",
			newStatus: "degraded",
			consecutiveFailures,
			checkId: result.id,
		});
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
