import { truncate } from "../../format";
import { postJson } from "./http";
import { describeNotification } from "./message";
import type { NotificationPayload, NotificationResult } from "./types";

// Discord rejects the whole embed when a title or field exceeds its limit.
const field = (name: string, value: string, inline: boolean) => ({
	name: truncate(name, 256),
	value: truncate(value, 1024),
	inline,
});

export function sendDiscord(
	config: { discordWebhookUrl: string },
	payload: NotificationPayload,
): Promise<NotificationResult> {
	const { title, color, fields, details } = describeNotification(payload);
	const timestamp = payload.timestamp.toISOString();

	const embed = {
		title: truncate(title, 256),
		color,
		fields: [
			...fields.map(([name, value]) => field(name, value, true)),
			field("Time", timestamp, true),
			...details.map(([name, value]) => field(name, value, false)),
		],
		timestamp,
	};

	return postJson(config.discordWebhookUrl, { embeds: [embed] }, "Discord API");
}
