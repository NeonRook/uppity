import type { Logger } from "pino";

import type { EventStatus, WideEventBase } from "./types";

/**
 * Builder class for accumulating context throughout an operation's lifecycle.
 * Emits a single comprehensive log event when emit() is called.
 *
 * Usage:
 *   const event = new WideEventBuilder<RequestWideEvent>(logger, "http_request", requestId);
 *   event.set("http_method", "POST");
 *   event.merge({ user_id: "123", org_id: "456" });
 *   event.setSuccess();
 *   event.emit("request");
 */
export class WideEventBuilder<T extends WideEventBase> {
	private logger: Logger;
	private data: Partial<T>;
	private startTime: number;

	constructor(logger: Logger, eventType: T["event_type"], requestId: string) {
		this.logger = logger;
		this.startTime = Date.now();
		this.data = {
			event_type: eventType,
			request_id: requestId,
			started_at: new Date(),
		} as Partial<T>;
	}

	/**
	 * Set a single field on the event
	 */
	set<K extends keyof T>(key: K, value: T[K]): this {
		this.data[key] = value;
		return this;
	}

	/**
	 * Get a field value from the event
	 */
	get<K extends keyof T>(key: K): T[K] | undefined {
		return this.data[key];
	}

	/**
	 * Merge multiple fields into the event
	 */
	merge(fields: Partial<T>): this {
		Object.assign(this.data, fields);
		return this;
	}

	/**
	 * Mark the event as successful
	 */
	setSuccess(): this {
		(this.data as WideEventBase).status = "success";
		return this;
	}

	/**
	 * Mark the event as failed with error details
	 */
	setError(error: unknown): this {
		const base = this.data as WideEventBase;
		base.status = "error";

		if (error instanceof Error) {
			base.error_type = error.constructor.name;
			base.error_message = error.message;
			base.error_stack = error.stack;
		} else {
			base.error_type = "Unknown";
			base.error_message = String(error);
		}

		return this;
	}

	/**
	 * Set a custom status
	 */
	setStatus(status: EventStatus): this {
		(this.data as WideEventBase).status = status;
		return this;
	}

	/**
	 * Emit the wide event to the logger.
	 * Automatically calculates duration_ms.
	 *
	 * @param msg - Log message (e.g., "request", "check", "maintenance")
	 */
	emit(msg: string): void {
		const base = this.data as WideEventBase;
		base.duration_ms = Date.now() - this.startTime;

		// Use appropriate log level based on status
		if (base.status === "error") {
			this.logger.error(this.data as unknown, msg);
		} else {
			this.logger.info(this.data as unknown, msg);
		}
	}

	/**
	 * Emit a warning-level wide event
	 */
	emitWarn(msg: string): void {
		const base = this.data as WideEventBase;
		base.duration_ms = Date.now() - this.startTime;
		this.logger.warn(this.data as unknown, msg);
	}

	/**
	 * Get the raw event data (for testing or debugging)
	 */
	getData(): Partial<T> {
		return { ...this.data };
	}

	/**
	 * Get the request ID for this event
	 */
	getRequestId(): string {
		return (this.data as WideEventBase).request_id;
	}
}
