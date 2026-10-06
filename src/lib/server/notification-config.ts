import type { NotificationChannelForm } from "#lib/schemas/notification-channel.js";

/** Builds the stored channel config from form data, or null when the custom headers are not valid JSON. */
export function buildChannelConfig(data: NotificationChannelForm): Record<string, unknown> | null {
	switch (data.type) {
		case "email":
			return { email: data.email };
		case "slack":
			return { webhookUrl: data.webhookUrl, channel: data.channel };
		case "discord":
			return { discordWebhookUrl: data.discordWebhookUrl };
		default: {
			let headers: Record<string, string> | undefined;
			if (data.headers) {
				try {
					headers = JSON.parse(data.headers);
				} catch {
					return null;
				}
			}
			return { url: data.url, method: data.method, headers, bodyTemplate: data.bodyTemplate };
		}
	}
}
