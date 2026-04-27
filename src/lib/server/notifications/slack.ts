import type {
	NotificationPayload,
	NotificationResult,
	NotificationProvider,
	SlackConfig,
} from "./types";

export class SlackNotificationProvider implements NotificationProvider {
	private config: SlackConfig;

	constructor(config: SlackConfig) {
		this.config = config;
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		try {
			const message = this.formatMessage(payload);

			const response = await fetch(this.config.webhookUrl, {
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
					errorMessage: `Slack API error: ${response.status} - ${text}`,
				};
			}

			return { success: true };
		} catch (error) {
			return {
				success: false,
				errorMessage: error instanceof Error ? error.message : "Failed to send Slack notification",
			};
		}
	}

	private formatMessage(payload: NotificationPayload): object {
		const monitorName = payload.monitor?.name || "Unknown Monitor";
		const timestamp = Math.floor(payload.timestamp.getTime() / 1000);

		switch (payload.type) {
			case "monitor_down":
				return {
					channel: this.config.channel,
					attachments: [
						{
							color: "#dc2626",
							blocks: [
								{
									type: "header",
									text: {
										type: "plain_text",
										text: `🔴 Monitor Down: ${monitorName}`,
										emoji: true,
									},
								},
								{
									type: "section",
									fields: [
										{
											type: "mrkdwn",
											text: `*Status:*\nDown`,
										},
										{
											type: "mrkdwn",
											text: `*Time:*\n<!date^${timestamp}^{date_short_pretty} {time}|${payload.timestamp.toISOString()}>`,
										},
									],
								},
								...(payload.errorMessage
									? [
											{
												type: "section",
												text: {
													type: "mrkdwn",
													text: `*Error:* ${payload.errorMessage}`,
												},
											},
										]
									: []),
								...(payload.monitor?.url
									? [
											{
												type: "context",
												elements: [
													{
														type: "mrkdwn",
														text: `<${payload.monitor.url}|${payload.monitor.url}>`,
													},
												],
											},
										]
									: []),
							],
						},
					],
				};

			case "monitor_up":
				return {
					channel: this.config.channel,
					attachments: [
						{
							color: "#16a34a",
							blocks: [
								{
									type: "header",
									text: {
										type: "plain_text",
										text: `🟢 Monitor Recovered: ${monitorName}`,
										emoji: true,
									},
								},
								{
									type: "section",
									fields: [
										{
											type: "mrkdwn",
											text: `*Status:*\nRecovered`,
										},
										{
											type: "mrkdwn",
											text: `*Time:*\n<!date^${timestamp}^{date_short_pretty} {time}|${payload.timestamp.toISOString()}>`,
										},
									],
								},
								...(payload.monitor?.url
									? [
											{
												type: "context",
												elements: [
													{
														type: "mrkdwn",
														text: `<${payload.monitor.url}|${payload.monitor.url}>`,
													},
												],
											},
										]
									: []),
							],
						},
					],
				};

			case "monitor_degraded":
				return {
					channel: this.config.channel,
					attachments: [
						{
							color: "#eab308",
							blocks: [
								{
									type: "header",
									text: {
										type: "plain_text",
										text: `🟡 Monitor Degraded: ${monitorName}`,
										emoji: true,
									},
								},
								{
									type: "section",
									fields: [
										{
											type: "mrkdwn",
											text: `*Status:*\nDegraded`,
										},
										{
											type: "mrkdwn",
											text: `*Time:*\n<!date^${timestamp}^{date_short_pretty} {time}|${payload.timestamp.toISOString()}>`,
										},
									],
								},
							],
						},
					],
				};

			case "ssl_expiry_warning":
				return {
					channel: this.config.channel,
					attachments: [
						{
							color: "#f97316",
							blocks: [
								{
									type: "header",
									text: {
										type: "plain_text",
										text: `⚠️ SSL Expiring: ${monitorName}`,
										emoji: true,
									},
								},
								{
									type: "section",
									fields: [
										{
											type: "mrkdwn",
											text: `*Days Remaining:*\n${payload.sslDaysRemaining}`,
										},
										{
											type: "mrkdwn",
											text: `*Time:*\n<!date^${timestamp}^{date_short_pretty} {time}|${payload.timestamp.toISOString()}>`,
										},
									],
								},
							],
						},
					],
				};

			case "incident_created":
				return {
					channel: this.config.channel,
					attachments: [
						{
							color: "#dc2626",
							blocks: [
								{
									type: "header",
									text: {
										type: "plain_text",
										text: `🚨 Incident: ${payload.incident?.title}`,
										emoji: true,
									},
								},
								{
									type: "section",
									fields: [
										{
											type: "mrkdwn",
											text: `*Impact:*\n${payload.incident?.impact}`,
										},
										{
											type: "mrkdwn",
											text: `*Status:*\n${payload.incident?.status}`,
										},
									],
								},
							],
						},
					],
				};

			case "incident_updated":
				return {
					channel: this.config.channel,
					attachments: [
						{
							color: "#f59e0b",
							blocks: [
								{
									type: "header",
									text: {
										type: "plain_text",
										text: `📝 Incident Update: ${payload.incident?.title}`,
										emoji: true,
									},
								},
								{
									type: "section",
									fields: [
										{
											type: "mrkdwn",
											text: `*Status:*\n${payload.incident?.status}`,
										},
										{
											type: "mrkdwn",
											text: `*Impact:*\n${payload.incident?.impact}`,
										},
									],
								},
								...(payload.updateMessage
									? [
											{
												type: "section",
												text: {
													type: "mrkdwn",
													text: `*Update:*\n${payload.updateMessage}`,
												},
											},
										]
									: []),
							],
						},
					],
				};

			case "incident_resolved":
				return {
					channel: this.config.channel,
					attachments: [
						{
							color: "#16a34a",
							blocks: [
								{
									type: "header",
									text: {
										type: "plain_text",
										text: `✅ Resolved: ${payload.incident?.title}`,
										emoji: true,
									},
								},
							],
						},
					],
				};

			default:
				return {
					channel: this.config.channel,
					text: `Alert for ${monitorName}`,
				};
		}
	}
}
