import { nanoid } from "nanoid";
import pino, { type Logger } from "pino";

import { WideEventBuilder } from "./context";
import type {
	CheckWideEvent,
	MaintenanceWideEvent,
	NotificationWideEvent,
	NotifierWideEvent,
	RequestWideEvent,
	WebhookWideEvent,
} from "./types";

/**
 * Build pino options. Pretty-prints only in a Vite dev server; everything else
 * gets JSON.
 */
function buildPinoOptions(): pino.LoggerOptions {
	const options: pino.LoggerOptions = {
		level: process.env.LOG_LEVEL || "info",
		base: {
			service: process.env.SERVICE_NAME || "uppity",
			version: process.env.npm_package_version || "0.0.1",
			env: process.env.NODE_ENV || "development",
		},
		timestamp: pino.stdTimeFunctions.isoTime,
	};

	// Vite's types promise a boolean, and under Vite that holds: it substitutes a
	// literal, so this branch is eliminated from the production server bundle.
	//
	// The workers are bundled by `bun build`, which does not substitute it. There
	// this stays a runtime read, and Bun maps import.meta.env onto process.env,
	// where every value is a string. Hence the wider type - it describes what the
	// worker actually sees, and makes the `=== true` check below meaningful rather
	// than the tautology the Vite-only types would suggest.
	const viteDev = import.meta.env.DEV as boolean | string | undefined;

	// Only a real boolean true means "Vite dev server". A stray DEV=1 in a
	// worker's environment arrives as "1" and must not match: pino-pretty is a
	// devDependency, absent from production images, so activating this transport
	// there would fail to resolve rather than merely look untidy.
	if (viteDev === true) {
		options.transport = {
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "SYS:HH:MM:ss",
				ignore: "pid,hostname,service,version,env",
				messageFormat: "{event_type} {msg}",
			},
		};
	}

	return options;
}

/**
 * Base Pino logger configuration.
 * - Pretty printing in development
 * - JSON output in production
 */
const baseLogger = pino(buildPinoOptions());

/**
 * Generate a unique request ID
 */
export function generateRequestId(prefix: string = "req"): string {
	return `${prefix}_${nanoid(12)}`;
}

/**
 * Create a logger instance for HTTP requests.
 * Returns a child logger bound to the request context.
 */
export function createRequestLogger(): Logger {
	return baseLogger.child({ context: "http" });
}

/**
 * Create a logger instance for the monitor scheduler subsystem.
 */
export function createSchedulerLogger(): Logger {
	return baseLogger.child({ context: "scheduler" });
}

/**
 * Create a logger instance for maintenance jobs.
 */
export function createMaintenanceLogger(): Logger {
	return baseLogger.child({ context: "maintenance" });
}

/**
 * Create a wide event builder for HTTP requests.
 */
export function createRequestWideEvent(requestId?: string): WideEventBuilder<RequestWideEvent> {
	const id = requestId || generateRequestId("req");
	return new WideEventBuilder<RequestWideEvent>(createRequestLogger(), "http_request", id);
}

/**
 * Create a wide event builder for monitor checks.
 */
export function createCheckWideEvent(_monitorId: string): WideEventBuilder<CheckWideEvent> {
	const requestId = generateRequestId("chk");
	return new WideEventBuilder<CheckWideEvent>(createSchedulerLogger(), "monitor_check", requestId);
}

/**
 * Create a wide event builder for maintenance jobs.
 */
export function createMaintenanceWideEvent(_jobId: string): WideEventBuilder<MaintenanceWideEvent> {
	const requestId = generateRequestId("mnt");
	return new WideEventBuilder<MaintenanceWideEvent>(
		createMaintenanceLogger(),
		"maintenance_job",
		requestId,
	);
}

/**
 * Create a wide event builder for notifications.
 */
export function createNotificationWideEvent(
	_channelId: string,
): WideEventBuilder<NotificationWideEvent> {
	const requestId = generateRequestId("ntf");
	return new WideEventBuilder<NotificationWideEvent>(
		baseLogger.child({ context: "notification" }),
		"notification",
		requestId,
	);
}

/**
 * Create a logger instance for the notifier consumer subsystem.
 */
export function createConsumerLogger(): Logger {
	return baseLogger.child({ context: "consumer" });
}

/**
 * Create a wide event builder for the notifier worker — one per claimed event row.
 */
export function createNotifierWideEvent(eventId?: string): WideEventBuilder<NotifierWideEvent> {
	const requestId = eventId ?? generateRequestId("ntr");
	return new WideEventBuilder<NotifierWideEvent>(createConsumerLogger(), "notifier", requestId);
}

/**
 * Create a wide event builder for incoming webhooks.
 */
export function createWebhookWideEvent(source: string): WideEventBuilder<WebhookWideEvent> {
	const requestId = generateRequestId("whk");
	const builder = new WideEventBuilder<WebhookWideEvent>(
		baseLogger.child({ context: "webhook" }),
		"webhook",
		requestId,
	);
	builder.set("webhook_source", source);
	return builder;
}

// Export core types and classes
export { WideEventBuilder } from "./context";
export * from "./types";

// Export the base logger for direct logging when wide events aren't needed
export const logger = baseLogger;
