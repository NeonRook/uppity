import { Mail, MessageSquare, Webhook } from "@lucide/svelte";

import { m } from "#lib/paraglide/messages.js";

/** Display metadata per notification channel type, in picker order. */
export const CHANNEL_TYPES = {
	email: { label: m.notification_type_email, description: m.notification_email_desc, icon: Mail },
	slack: {
		label: m.notification_type_slack,
		description: m.notification_slack_desc,
		icon: MessageSquare,
	},
	discord: {
		label: m.notification_type_discord,
		description: m.notification_discord_desc,
		icon: MessageSquare,
	},
	webhook: {
		label: m.notification_type_webhook,
		description: m.notification_webhook_desc,
		icon: Webhook,
	},
} as const;

export type ChannelType = keyof typeof CHANNEL_TYPES;

/** Stored channel types are constrained to `ChannelType` by the plan limits and the schema. */
export function getChannelType(type: string) {
	return CHANNEL_TYPES[type as ChannelType];
}

export const CHANNEL_TYPE_KEYS = Object.keys(CHANNEL_TYPES) as ChannelType[];

/** Channel types the plan allows. Self-hosted instances have no plan limits. */
export function getAvailableChannelTypes(
	selfHosted: boolean,
	planChannels: ChannelType[] | undefined,
): ChannelType[] {
	return selfHosted ? CHANNEL_TYPE_KEYS : (planChannels ?? CHANNEL_TYPE_KEYS);
}
