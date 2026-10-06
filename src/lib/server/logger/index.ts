import { nanoid } from "nanoid";
import pino, { type Logger } from "pino";

import { WideEventBuilder } from "./context";
import type { WideEventBase } from "./types";

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

	// pino-pretty is a devDependency and is absent from production images. Vite
	// substitutes a literal here, so every production bundle drops this branch and
	// the unresolvable target with it.
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

/** Child logger tagged with `context`. */
export function childLogger(context: string): Logger {
	return baseLogger.child({ context });
}

/**
 * Wide event builder logging under `context`. The request id is `id`, or a
 * random `${idPrefix}_…` when omitted.
 */
export function wideEvent<T extends WideEventBase>(
	context: string,
	eventType: T["event_type"],
	idPrefix: string,
	id?: string,
): WideEventBuilder<T> {
	return new WideEventBuilder<T>(
		childLogger(context),
		eventType,
		id ?? `${idPrefix}_${nanoid(12)}`,
	);
}

// Export core types and classes
export { WideEventBuilder } from "./context";
export * from "./types";

// Export the base logger for direct logging when wide events aren't needed
export const logger = baseLogger;
