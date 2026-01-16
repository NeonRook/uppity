import type {
	NotificationPayload,
	NotificationResult,
	NotificationProvider,
	WebhookConfig,
} from "./types";

export class WebhookNotificationProvider implements NotificationProvider {
	private config: WebhookConfig;

	constructor(config: WebhookConfig) {
		this.config = config;
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		try {
			const body = this.formatBody(payload);

			const response = await fetch(this.config.url, {
				method: this.config.method || "POST",
				headers: {
					"Content-Type": "application/json",
					...this.config.headers,
				},
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const text = await response.text();
				return {
					success: false,
					errorMessage: `Webhook error: ${response.status} - ${text}`,
				};
			}

			return { success: true };
		} catch (error) {
			return {
				success: false,
				errorMessage: error instanceof Error ? error.message : "Failed to send webhook",
			};
		}
	}

	private formatBody(payload: NotificationPayload): object {
		// If a custom body template is provided, try to parse and interpolate it
		if (this.config.bodyTemplate) {
			try {
				const template = JSON.parse(this.config.bodyTemplate) as object;
				return this.interpolateTemplate(template, payload) as object;
			} catch {
				// If parsing fails, use default format
			}
		}

		// Default webhook format
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
			sslDaysRemaining: payload.sslDaysRemaining,
		};
	}

	private interpolateTemplate(template: unknown, payload: NotificationPayload): unknown {
		if (typeof template === "string") {
			return template
				.replace(/\{\{monitor\.name\}\}/g, payload.monitor?.name || "")
				.replace(/\{\{monitor\.url\}\}/g, payload.monitor?.url || "")
				.replace(/\{\{monitor\.id\}\}/g, payload.monitor?.id || "")
				.replace(/\{\{type\}\}/g, payload.type)
				.replace(/\{\{status\}\}/g, payload.status?.status || "")
				.replace(/\{\{timestamp\}\}/g, payload.timestamp.toISOString())
				.replace(/\{\{errorMessage\}\}/g, payload.errorMessage || "")
				.replace(/\{\{previousStatus\}\}/g, payload.previousStatus || "")
				.replace(/\{\{sslDaysRemaining\}\}/g, String(payload.sslDaysRemaining || ""))
				.replace(/\{\{incident\.title\}\}/g, payload.incident?.title || "")
				.replace(/\{\{incident\.status\}\}/g, payload.incident?.status || "")
				.replace(/\{\{incident\.impact\}\}/g, payload.incident?.impact || "");
		}

		if (Array.isArray(template)) {
			return template.map((item) => this.interpolateTemplate(item, payload));
		}

		if (typeof template === "object" && template !== null) {
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(template)) {
				result[key] = this.interpolateTemplate(value, payload);
			}
			return result;
		}

		return template;
	}
}
