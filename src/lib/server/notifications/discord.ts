import { postJson } from "./http";
import { describeNotification } from "./message";
import type { NotificationPayload, NotificationResult } from "./types";

export function sendDiscord(
	config: { discordWebhookUrl: string },
	payload: NotificationPayload,
): Promise<NotificationResult> {
	const { title, color, fields, details } = describeNotification(payload);
	const timestamp = payload.timestamp.toISOString();

	const embed = {
		title,
		color,
		fields: [
			...fields.map(([name, value]) => ({ name, value, inline: true })),
			{ name: "Time", value: timestamp, inline: true },
			...details.map(([name, value]) => ({ name, value, inline: false })),
		],
		timestamp,
	};

	return postJson(config.discordWebhookUrl, { embeds: [embed] }, "Discord API");
}
