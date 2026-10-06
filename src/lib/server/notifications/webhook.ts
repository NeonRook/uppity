import { postJson } from "./http";
import type { NotificationPayload, NotificationResult } from "./types";

interface WebhookConfig {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	bodyTemplate?: string;
}

export function sendWebhook(
	config: WebhookConfig,
	payload: NotificationPayload,
): Promise<NotificationResult> {
	return postJson(config.url, formatBody(config, payload), "Webhook", config);
}

function formatBody(config: WebhookConfig, payload: NotificationPayload): object {
	if (config.bodyTemplate) {
		try {
			return interpolate(JSON.parse(config.bodyTemplate), templateVars(payload)) as object;
		} catch {
			// Unparseable template falls back to the default body.
		}
	}

	return {
		type: payload.type,
		timestamp: payload.timestamp.toISOString(),
		monitor: payload.monitor
			? {
					id: payload.monitor.id,
					name: payload.monitor.name,
					type: payload.monitor.type,
					url: payload.monitor.url,
					hostname: payload.monitor.hostname,
					port: payload.monitor.port,
				}
			: null,
		status: payload.status
			? {
					status: payload.status.status,
					lastCheckAt: payload.status.lastCheckAt,
					consecutiveFailures: payload.status.consecutiveFailures,
				}
			: null,
		incident: payload.incident
			? {
					id: payload.incident.id,
					title: payload.incident.title,
					status: payload.incident.status,
					impact: payload.incident.impact,
				}
			: null,
		previousStatus: payload.previousStatus,
		errorMessage: payload.errorMessage,
		updateMessage: payload.updateMessage,
		sslDaysRemaining: payload.sslDaysRemaining,
	};
}

function templateVars(payload: NotificationPayload): Record<string, string> {
	return {
		"monitor.name": payload.monitor?.name || "",
		"monitor.url": payload.monitor?.url || "",
		"monitor.id": payload.monitor?.id || "",
		type: payload.type,
		status: payload.status?.status || "",
		timestamp: payload.timestamp.toISOString(),
		errorMessage: payload.errorMessage || "",
		updateMessage: payload.updateMessage || "",
		previousStatus: payload.previousStatus || "",
		sslDaysRemaining: String(payload.sslDaysRemaining || ""),
		"incident.title": payload.incident?.title || "",
		"incident.status": payload.incident?.status || "",
		"incident.impact": payload.incident?.impact || "",
	};
}

/** Replaces `{{name}}` in every string of `template`; unknown names stay as written. */
function interpolate(template: unknown, vars: Record<string, string>): unknown {
	if (typeof template === "string") {
		return template.replace(/\{\{([\w.]+)\}\}/g, (match, name: string) =>
			Object.hasOwn(vars, name) ? vars[name] : match,);
	}
	if (Array.isArray(template)) {
		return template.map((item) => interpolate(item, vars));
	}
	if (typeof template === "object" && template !== null) {
		return Object.fromEntries(
			Object.entries(template).map(([key, value]) => [key, interpolate(value, vars)]),
		);
	}
	return template;
}
