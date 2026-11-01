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

/** Dead-letter entry and recovery carry nothing beyond the monitor the event row names. */
export const CheckStateEventPayload = v.object({});
export type CheckStateEventPayload = Record<string, never>;

export const IncidentEventPayload = v.object({
	// For incident_updated only: the specific update entry's id and message body.
	// For incident_created and incident_resolved: omitted.
	updateId: v.optional(v.string()),
	updateMessage: v.optional(v.string()),
});
export type IncidentEventPayload = v.InferOutput<typeof IncidentEventPayload>;

export const CHANNEL_CONFIRMATION_EVENT = "channel_confirmation";

/** Not `pending` and `processing`, so that no alert sweep claims a confirmation email. */
export const CONFIRMATION_QUEUED = "confirmation_queued";
export const CONFIRMATION_SENDING = "confirmation_sending";

/** Not `pending`, so that only the retry sweep picks up an alert, and only once it is due. */
export const RETRY_QUEUED = "retry_queued";
export const RETRY_SENDING = "retry_sending";

/** What an event's next delivery attempt needs from the attempts before it. */
const DeliveryProgress = v.object({
	/** Channels the event still owes. Delivered and rejected ones are not sent again. */
	owed: v.array(v.string()),
	reached: v.boolean(),
	/** Final failures, kept so that the row still reports them when it ends. */
	rejected: v.array(v.string()),
});
export type DeliveryProgress = v.InferOutput<typeof DeliveryProgress>;

/**
 * Lives in the payload rather than in columns because the notifier can start before the web
 * tier's pre-deploy step has migrated, and a column it cannot read would stop every alert.
 */
const QueuedRetry = v.object({
	...DeliveryProgress.entries,
	attempt: v.pipe(v.number(), v.integer(), v.minValue(1)),
	nextAt: v.pipe(v.string(), v.isoTimestamp()),
});

export function queuedRetry(payload: unknown): v.InferOutput<typeof QueuedRetry> | undefined {
	const { retry } = payload as { retry?: unknown };
	return v.is(QueuedRetry, retry) ? retry : undefined;
}

const NullableTimestamp = v.nullable(v.pipe(v.string(), v.isoTimestamp()));

/** A confirmation email whose slot is taken. The link token stays on the channel, out of the queue. */
export const ChannelConfirmationPayload = v.object({
	channelId: v.string(),
	sendId: v.string(),
	email: v.string(),
	requestedBy: v.string(),
	previous: v.object({
		confirmationSentAt: NullableTimestamp,
		unsubscribedAt: NullableTimestamp,
	}),
	reasked: v.boolean(),
});
export type ChannelConfirmationPayload = v.InferOutput<typeof ChannelConfirmationPayload>;

/**
 * Validates that a payload matches the schema for the given event type.
 * Returns the parsed payload or throws on mismatch.
 */
export function parseEventPayload(
	type: NotificationType,
	payload: unknown,
):
	| MonitorStatusEventPayload
	| SslExpiryEventPayload
	| CheckStateEventPayload
	| IncidentEventPayload {
	if (type === "monitor_down" || type === "monitor_up" || type === "monitor_degraded") {
		return v.parse(MonitorStatusEventPayload, payload);
	}
	if (type === "ssl_expiry_warning") {
		return v.parse(SslExpiryEventPayload, payload);
	}
	if (type === "monitor_checks_stopped" || type === "monitor_checks_resumed") {
		return v.parse(CheckStateEventPayload, payload);
	}
	if (type === "incident_created" || type === "incident_updated" || type === "incident_resolved") {
		return v.parse(IncidentEventPayload, payload);
	}
	const exhaustiveCheck: never = type;
	throw new Error(`Unknown event type: ${String(exhaustiveCheck)}`);
}
