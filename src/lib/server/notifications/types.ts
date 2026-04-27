import type { Monitor, MonitorStatus, Incident } from "$lib/server/db/schema";

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

export interface NotificationProvider {
	send(payload: NotificationPayload): Promise<NotificationResult>;
}

export interface EmailConfig {
	email: string;
}

export interface SlackConfig {
	webhookUrl: string;
	channel?: string;
}

export interface DiscordConfig {
	discordWebhookUrl: string;
}

export interface WebhookConfig {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	bodyTemplate?: string;
}

export type ChannelConfig = EmailConfig | SlackConfig | DiscordConfig | WebhookConfig;
