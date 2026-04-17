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
	| { type: "ssl_expiry_warning"; payload: SslExpiryEventPayload };

/**
 * Validates that a payload matches the schema for the given event type.
 * Returns the parsed payload or throws on mismatch.
 */
export function parseEventPayload(
	type: NotificationEventType,
	payload: unknown,
): MonitorStatusEventPayload | SslExpiryEventPayload {
	if (type === "monitor_down" || type === "monitor_up" || type === "monitor_degraded") {
		return v.parse(MonitorStatusEventPayload, payload);
	}
	if (type === "ssl_expiry_warning") {
		return v.parse(SslExpiryEventPayload, payload);
	}
	throw new Error(`Event type ${type} not yet implemented (NEO-6)`);
}
