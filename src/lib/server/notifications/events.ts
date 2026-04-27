import * as v from "valibot";

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

export type NotificationEventType =
	| "monitor_down"
	| "monitor_up"
	| "monitor_degraded"
	| "ssl_expiry_warning"
	| "incident_created"
	| "incident_updated"
	| "incident_resolved";

/**
 * Type-safe payload discriminator. NEO-5 defines the first four; NEO-6 fills in
 * incident_* payloads.
 */
export type NotificationEventPayload =
	| { type: "monitor_down"; payload: MonitorStatusEventPayload }
	| { type: "monitor_up"; payload: MonitorStatusEventPayload }
	| { type: "monitor_degraded"; payload: MonitorStatusEventPayload }
	| { type: "ssl_expiry_warning"; payload: SslExpiryEventPayload }
	| { type: "incident_created"; payload: IncidentEventPayload }
	| { type: "incident_updated"; payload: IncidentEventPayload }
	| { type: "incident_resolved"; payload: IncidentEventPayload };

/**
 * Validates that a payload matches the schema for the given event type.
 * Returns the parsed payload or throws on mismatch.
 */
export function parseEventPayload(
	type: NotificationEventType,
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
