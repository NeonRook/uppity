import type { Monitor, MonitorStatus, Incident } from "#lib/server/db/schema.js";

export type NotificationType =
	| "monitor_down"
	| "monitor_up"
	| "monitor_degraded"
	| "monitor_checks_stopped"
	| "monitor_checks_resumed"
	| "incident_created"
	| "incident_updated"
	| "incident_resolved"
	| "ssl_expiry_warning";

/** The monitor fields a notification carries. */
export type NotifiedMonitor = Pick<Monitor, "id" | "name" | "type" | "url" | "hostname" | "port">;

export interface NotificationPayload {
	type: NotificationType;
	monitor?: NotifiedMonitor;
	status?: MonitorStatus;
	incident?: Incident;
	previousStatus?: string;
	sslDaysRemaining?: number;
	errorMessage?: string;
	updateMessage?: string;
	timestamp: Date;
}

export interface NotificationResult {
	success: boolean;
	errorMessage?: string;
}
