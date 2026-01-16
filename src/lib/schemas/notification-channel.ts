import * as v from "valibot";

const baseSchema = {
	name: v.pipe(v.string(), v.minLength(1, "Name is required")),
};

const emailSchema = v.object({
	...baseSchema,
	type: v.literal("email"),
	email: v.pipe(v.string(), v.email("Valid email address is required")),
});

const slackSchema = v.object({
	...baseSchema,
	type: v.literal("slack"),
	webhookUrl: v.pipe(
		v.string(),
		v.url("Valid URL is required"),
		v.regex(/^https:\/\/hooks\.slack\.com\//, "Must be a Slack webhook URL"),
	),
	channel: v.optional(v.string()),
});

const discordSchema = v.object({
	...baseSchema,
	type: v.literal("discord"),
	discordWebhookUrl: v.pipe(
		v.string(),
		v.url("Valid URL is required"),
		v.regex(/discord\.com\/api\/webhooks\//, "Must be a Discord webhook URL"),
	),
});

const webhookSchema = v.object({
	...baseSchema,
	type: v.literal("webhook"),
	url: v.pipe(v.string(), v.url("Valid webhook URL is required")),
	method: v.optional(v.picklist(["POST", "PUT", "PATCH"]), "POST"),
	headers: v.optional(v.string()),
	bodyTemplate: v.optional(v.string()),
});

export const notificationChannelSchema = v.variant("type", [
	emailSchema,
	slackSchema,
	discordSchema,
	webhookSchema,
]);

export type NotificationChannelForm = v.InferInput<typeof notificationChannelSchema>;

// List page actions
export const toggleChannelSchema = v.object({
	channelId: v.pipe(v.string(), v.minLength(1, "Channel ID is required")),
});

export type ToggleChannelForm = v.InferInput<typeof toggleChannelSchema>;

export const deleteChannelSchema = v.object({
	channelId: v.pipe(v.string(), v.minLength(1, "Channel ID is required")),
});

export type DeleteChannelForm = v.InferInput<typeof deleteChannelSchema>;
