import * as v from "valibot";

import type { NotificationType } from "./types";

/**
 * Payload schemas for notification_event rows, keyed by the event `type` column.
 * Used to validate payload shape at enqueue time (monitor worker) and dispatch
 * time (notifier worker, future NEO-29).
 */

export const MonitorStatusEventPayload = v.object({
	previousStatus: v.picklist(["up", "down", "degraded", "unknown"]),
	newStatus: v.picklist(["up", "down", "degraded"]),
	consecutiveFailures: v.pipe(v.number(), v.integer(), v.minValue(0)),
	errorMessage: v.optional(v.string()),
	checkId: v.string(),
});
export type MonitorStatusEventPayload = v.InferOutput<typeof MonitorStatusEventPayload>;

export const SslExpiryEventPayload = v.object({
	daysRemaining: v.pipe(v.number(), v.integer()),
	sslExpiresAt: v.pipe(v.string(), v.isoTimestamp()),
	sslIssuer: v.optional(v.string()),
});
export type SslExpiryEventPayload = v.InferOutput<typeof SslExpiryEventPayload>;

export const IncidentEventPayload = v.object({
	// For incident_updated only: the specific update entry's id and message body.
	// For incident_created and incident_resolved: omitted.
	updateId: v.optional(v.string()),
	updateMessage: v.optional(v.string()),
});
export type IncidentEventPayload = v.InferOutput<typeof IncidentEventPayload>;

/**
 * Validates that a payload matches the schema for the given event type.
 * Returns the parsed payload or throws on mismatch.
 */
export function parseEventPayload(
	type: NotificationType,
	payload: unknown,
): MonitorStatusEventPayload | SslExpiryEventPayload | IncidentEventPayload {
	if (type === "monitor_down" || type === "monitor_up" || type === "monitor_degraded") {
		return v.parse(MonitorStatusEventPayload, payload);
	}
	if (type === "ssl_expiry_warning") {
		return v.parse(SslExpiryEventPayload, payload);
	}
	if (type === "incident_created" || type === "incident_updated" || type === "incident_resolved") {
		return v.parse(IncidentEventPayload, payload);
	}
	const exhaustiveCheck: never = type;
	throw new Error(`Unknown event type: ${String(exhaustiveCheck)}`);
}
