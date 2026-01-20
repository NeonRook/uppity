/**
 * Wide Event type definitions for structured logging.
 *
 * Following the "wide events" / "canonical log lines" philosophy:
 * - One comprehensive log event per request/operation
 * - High cardinality fields (user_id, org_id, monitor_id)
 * - High dimensionality (many fields capturing full business context)
 */

export type EventType = "http_request" | "monitor_check" | "maintenance_job" | "notification";

export type EventStatus = "success" | "error";

/**
 * Base fields present in all wide events
 */
export interface WideEventBase {
	/** Unique identifier for this event/request */
	request_id: string;
	/** Type of wide event */
	event_type: EventType;
	/** When the operation started */
	started_at: Date;
	/** Duration in milliseconds */
	duration_ms?: number;
	/** Overall status of the operation */
	status?: EventStatus;
	/** Error class/type if status is error */
	error_type?: string;
	/** Error message if status is error */
	error_message?: string;
	/** Error stack trace */
	error_stack?: string;
}

/**
 * HTTP Request wide event - emitted once per request
 */
export interface RequestWideEvent extends WideEventBase {
	event_type: "http_request";

	// HTTP context
	http_method: string;
	http_path: string;
	http_route?: string;
	http_status?: number;
	client_ip?: string;
	user_agent?: string;

	// Auth context (enriched after auth middleware)
	user_id?: string;
	user_email?: string;
	org_id?: string;
	session_id?: string;

	// Business context (enriched by services)
	action?: string;
	resource_type?: string;
	resource_id?: string;

	// Additional context
	[key: string]: unknown;
}

/**
 * Monitor check wide event - emitted once per check execution
 */
export interface CheckWideEvent extends WideEventBase {
	event_type: "monitor_check";

	// Monitor context
	monitor_id: string;
	monitor_name: string;
	monitor_type: "http" | "tcp" | "push";
	org_id: string;

	// Check execution
	check_status?: "up" | "down" | "degraded";
	response_time_ms?: number;
	status_code?: number;
	check_error?: string;

	// Retries
	retry_attempt?: number;
	total_retries?: number;

	// Status change
	status_changed?: boolean;
	previous_status?: string;
	consecutive_failures?: number;

	// Incidents
	incident_created?: boolean;
	incident_id?: string;
	incident_resolved?: boolean;

	// SSL
	ssl_expires_at?: Date;
	ssl_days_remaining?: number;
	ssl_expiry_warning?: boolean;

	// Notifications
	notifications_triggered?: number;
}

/**
 * Maintenance job wide event - emitted once per job execution
 */
export interface MaintenanceWideEvent extends WideEventBase {
	event_type: "maintenance_job";

	// Job context
	job_id: string;
	job_name: string;

	// Execution results
	records_processed?: number;
	records_deleted?: number;
	next_run_at?: Date;
}

/**
 * Notification wide event - emitted once per notification send
 */
export interface NotificationWideEvent extends WideEventBase {
	event_type: "notification";

	// Channel context
	channel_id: string;
	channel_type: string;
	channel_name?: string;

	// Delivery
	monitor_id?: string;
	incident_id?: string;
	notification_type: string;
	delivery_status: "sent" | "failed";
	delivery_error?: string;
}

/**
 * Union of all wide event types
 */
export type WideEvent =
	| RequestWideEvent
	| CheckWideEvent
	| MaintenanceWideEvent
	| NotificationWideEvent;
