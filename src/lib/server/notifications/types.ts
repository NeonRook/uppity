import type { Monitor, MonitorStatus, Incident } from "#lib/server/db/schema.js";

export type NotificationType =
	| "monitor_down"
	| "monitor_up"
	| "monitor_degraded"
	| "incident_created"
	| "incident_updated"
	| "incident_resolved"
	| "ssl_expiry_warning";

export interface NotificationPayload {
	type: NotificationType;
	monitor?: Monitor;
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
