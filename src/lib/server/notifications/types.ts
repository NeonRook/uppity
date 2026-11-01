import type { Monitor, MonitorStatus, Incident } from "#lib/server/db/schema.js";

import type { MonitorFlappingEventPayload } from "./events";

export type NotificationType =
	| "monitor_down"
	| "monitor_up"
	| "monitor_degraded"
	| "monitor_checks_stopped"
	| "monitor_checks_resumed"
	| "monitor_flapping"
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
	flap?: MonitorFlappingEventPayload;
	errorMessage?: string;
	updateMessage?: string;
	timestamp: Date;
	late?: LateDelivery;
}

/** How a retried alert differs from one sent on time. */
export interface LateDelivery {
	minutes: number;
	/** The state the monitor or incident has moved to since the event, if it has. */
	now?: string;
}

export interface NotificationResult {
	success: boolean;
	errorMessage?: string;
	/** The failure may pass, so the alert is worth sending again. */
	transient?: boolean;
	/** The fault is the instance's mail server, not the customer's destination. */
	mailServerDown?: boolean;
}
