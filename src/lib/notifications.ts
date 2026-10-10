import { Bell, Mail, MessageSquare, Webhook } from "@lucide/svelte";

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

/** The stored type is unconstrained text, so an unknown one still renders and can be deleted. */
export function getChannelType(type: string) {
	return (
		CHANNEL_TYPES[type as ChannelType] ?? { label: () => type, description: () => "", icon: Bell }
	);
}

/** A channel as monitor forms list it. */
export interface ChannelOption {
	id: string;
	name: string;
	type: string;
	enabled: boolean;
	/** Where alerts land, when that can be shown without exposing a secret. */
	destination: string | null;
}

export const CHANNEL_TYPE_KEYS = Object.keys(CHANNEL_TYPES) as ChannelType[];

/** Channel types the plan allows. Self-hosted instances have no plan limits. */
export function getAvailableChannelTypes(
	selfHosted: boolean,
	planChannels: ChannelType[] | undefined,
): ChannelType[] {
	return selfHosted ? CHANNEL_TYPE_KEYS : (planChannels ?? CHANNEL_TYPE_KEYS);
}
