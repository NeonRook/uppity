import { nanoid } from "nanoid";
import pino, { type Logger } from "pino";

import { WideEventBuilder } from "./context";
import type {
	CheckWideEvent,
	MaintenanceWideEvent,
	NotificationWideEvent,
	RequestWideEvent,
	WebhookWideEvent,
} from "./types";

/**
 * Build pino options. Uses import.meta.env.DEV for compile-time elimination
 * of pino-pretty transport in production builds.
 */
function buildPinoOptions(): pino.LoggerOptions {
	const options: pino.LoggerOptions = {
		level: process.env.LOG_LEVEL || "info",
		base: {
			service: "uppity",
			version: process.env.npm_package_version || "0.0.1",
			env: process.env.NODE_ENV || "development",
		},
		timestamp: pino.stdTimeFunctions.isoTime,
	};

	// import.meta.env.DEV is replaced at build time by Vite,
	// so pino-pretty is tree-shaken from production bundles
	if (import.meta.env.DEV) {
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
 * Create a logger instance for the worker process.
 */
export function createWorkerLogger(): Logger {
	return baseLogger.child({ context: "worker" });
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
	return new WideEventBuilder<CheckWideEvent>(createWorkerLogger(), "monitor_check", requestId);
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
