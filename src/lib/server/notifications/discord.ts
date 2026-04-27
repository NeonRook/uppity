import type {
	NotificationPayload,
	NotificationResult,
	NotificationProvider,
	DiscordConfig,
} from "./types";

export class DiscordNotificationProvider implements NotificationProvider {
	private config: DiscordConfig;

	constructor(config: DiscordConfig) {
		this.config = config;
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		try {
			const message = this.formatMessage(payload);

			const response = await fetch(this.config.discordWebhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(message),
			});

			if (!response.ok) {
				const text = await response.text();
				return {
					success: false,
					errorMessage: `Discord API error: ${response.status} - ${text}`,
				};
			}

			return { success: true };
		} catch (error) {
			return {
				success: false,
				errorMessage:
					error instanceof Error ? error.message : "Failed to send Discord notification",
			};
		}
	}

	private formatMessage(payload: NotificationPayload): object {
		const monitorName = payload.monitor?.name || "Unknown Monitor";
		const timestamp = payload.timestamp.toISOString();

		switch (payload.type) {
			case "monitor_down":
				return {
					embeds: [
						{
							title: `🔴 Monitor Down: ${monitorName}`,
							color: 0xdc2626,
							fields: [
								{
									name: "Status",
									value: "Down",
									inline: true,
								},
								{
									name: "Time",
									value: timestamp,
									inline: true,
								},
								...(payload.errorMessage
									? [
											{
												name: "Error",
												value: payload.errorMessage,
												inline: false,
											},
										]
									: []),
								...(payload.monitor?.url
									? [
											{
												name: "URL",
												value: payload.monitor.url,
												inline: false,
											},
										]
									: []),
							],
							timestamp,
						},
					],
				};

			case "monitor_up":
				return {
					embeds: [
						{
							title: `🟢 Monitor Recovered: ${monitorName}`,
							color: 0x16a34a,
							fields: [
								{
									name: "Status",
									value: "Recovered",
									inline: true,
								},
								{
									name: "Previous Status",
									value: payload.previousStatus || "Down",
									inline: true,
								},
								...(payload.monitor?.url
									? [
											{
												name: "URL",
												value: payload.monitor.url,
												inline: false,
											},
										]
									: []),
							],
							timestamp,
						},
					],
				};

			case "monitor_degraded":
				return {
					embeds: [
						{
							title: `🟡 Monitor Degraded: ${monitorName}`,
							color: 0xeab308,
							fields: [
								{
									name: "Status",
									value: "Degraded (high response time)",
									inline: true,
								},
								{
									name: "Time",
									value: timestamp,
									inline: true,
								},
							],
							timestamp,
						},
					],
				};

			case "ssl_expiry_warning":
				return {
					embeds: [
						{
							title: `⚠️ SSL Certificate Expiring: ${monitorName}`,
							color: 0xf97316,
							fields: [
								{
									name: "Days Remaining",
									value: String(payload.sslDaysRemaining),
									inline: true,
								},
								{
									name: "Time",
									value: timestamp,
									inline: true,
								},
							],
							timestamp,
						},
					],
				};

			case "incident_created":
				return {
					embeds: [
						{
							title: `🚨 Incident: ${payload.incident?.title}`,
							color: 0xdc2626,
							fields: [
								{
									name: "Impact",
									value: payload.incident?.impact || "Unknown",
									inline: true,
								},
								{
									name: "Status",
									value: payload.incident?.status || "Investigating",
									inline: true,
								},
							],
							timestamp,
						},
					],
				};

			case "incident_updated":
				return {
					embeds: [
						{
							title: `📝 Incident Update: ${payload.incident?.title}`,
							color: 0xf59e0b,
							fields: [
								{
									name: "Status",
									value: payload.incident?.status || "Unknown",
									inline: true,
								},
								{
									name: "Impact",
									value: payload.incident?.impact || "Unknown",
									inline: true,
								},
								...(payload.updateMessage
									? [
											{
												name: "Update",
												value: payload.updateMessage,
												inline: false,
											},
										]
									: []),
							],
							timestamp,
						},
					],
				};

			case "incident_resolved":
				return {
					embeds: [
						{
							title: `✅ Incident Resolved: ${payload.incident?.title}`,
							color: 0x16a34a,
							timestamp,
						},
					],
				};

			default:
				return {
					content: `Alert for ${monitorName}`,
				};
		}
	}
}
