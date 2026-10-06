import { postJson } from "./http";
import { describeNotification } from "./message";
import type { NotificationPayload, NotificationResult } from "./types";

export function sendSlack(
	config: { webhookUrl: string; channel?: string },
	payload: NotificationPayload,
): Promise<NotificationResult> {
	const { title, color, fields, details } = describeNotification(payload);
	const seconds = Math.floor(payload.timestamp.getTime() / 1000);
	const time = `<!date^${seconds}^{date_short_pretty} {time}|${payload.timestamp.toISOString()}>`;

	const mrkdwn = (text: string) => ({ type: "mrkdwn", text });
	const blocks = [
		{ type: "header", text: { type: "plain_text", text: title, emoji: true } },
		{
			type: "section",
			fields: [...fields, ["Time", time]].map(([label, value]) => mrkdwn(`*${label}:*\n${value}`)),
		},
		...details.map(([label, value]) => ({
			type: "section",
			text: mrkdwn(`*${label}:* ${value}`),
		})),
	];

	return postJson(
		config.webhookUrl,
		{
			channel: config.channel,
			attachments: [{ color: `#${color.toString(16).padStart(6, "0")}`, blocks }],
		},
		"Slack API",
	);
}
