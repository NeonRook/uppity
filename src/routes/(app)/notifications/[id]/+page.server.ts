import { notificationChannelSchema } from "$lib/schemas/notification-channel";
import { notificationChannelService } from "$lib/server/services/notification-channel.service";
import { fail, redirect, error } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	const channel = await notificationChannelService.findByIdAndOrg(
		params.id,
		locals.session.activeOrganizationId,
	);

	if (!channel) {
		error(404, "Notification channel not found");
	}

	// Extract config values based on type
	const config = channel.config as Record<string, unknown>;
	const initialData: Record<string, unknown> = {
		name: channel.name,
		type: channel.type,
	};

	switch (channel.type) {
		case "email":
			initialData.email = config.email;
			break;
		case "slack":
			initialData.webhookUrl = config.webhookUrl;
			initialData.channel = config.channel;
			break;
		case "discord":
			initialData.discordWebhookUrl = config.discordWebhookUrl;
			break;
		case "webhook":
			initialData.url = config.url;
			initialData.method = config.method ?? "POST";
			initialData.headers = config.headers ? JSON.stringify(config.headers, null, 2) : undefined;
			initialData.bodyTemplate = config.bodyTemplate;
			break;
	}

	const form = await superValidate(initialData, valibot(notificationChannelSchema));

	return { channel, form };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(notificationChannelSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { data } = form;

		// Build config based on type
		let config: Record<string, unknown> = {};

		switch (data.type) {
			case "email":
				config = { email: data.email };
				break;
			case "slack":
				config = { webhookUrl: data.webhookUrl, channel: data.channel };
				break;
			case "discord":
				config = { discordWebhookUrl: data.discordWebhookUrl };
				break;
			case "webhook": {
				let headers: Record<string, string> | undefined;
				if (data.headers) {
					try {
						headers = JSON.parse(data.headers);
					} catch {
						return message(form, "Invalid headers JSON", { status: 400 });
					}
				}
				config = {
					url: data.url,
					method: data.method,
					headers,
					bodyTemplate: data.bodyTemplate,
				};
				break;
			}
		}

		// Enrich wide event with action context
		locals.event.merge({
			action: "update_notification_channel",
			resource_type: "notification_channel",
			resource_id: params.id,
		});

		try {
			await notificationChannelService.update(params.id, locals.session.activeOrganizationId, {
				name: data.name,
				config,
			});
		} catch (err) {
			locals.event.setError(err);
			return message(form, "Failed to update notification channel", { status: 500 });
		}

		redirect(302, "/notifications");
	},

	delete: async ({ params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		// Enrich wide event with action context
		locals.event.merge({
			action: "delete_notification_channel",
			resource_type: "notification_channel",
			resource_id: params.id,
		});

		const deleted = await notificationChannelService.delete(
			params.id,
			locals.session.activeOrganizationId,
		);

		if (!deleted) {
			return fail(404, { error: "Channel not found" });
		}

		redirect(302, "/notifications");
	},
};
